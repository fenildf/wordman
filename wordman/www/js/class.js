/*
 * Copyright (c) 2014, B3log Team
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * 词库操作.
 *
 * @author <a href="http://88250.b3log.org">Liang Ding</a>
 * @version 1.7.4.1, Dec 16, 2014
 * @since 1.0.0
 */

"use strict";

// 词库操作封装
var clazz = {
    /**
     * 第一次学习一个词库时默认的学习词数.
     * 
     * @type Number
     */
    DEFAULT_LEARN_NUM: 20,
    /**
     * 一次学习一个词库时最大的学习词数.
     * 
     * @type Number
     */
    MAX_LEARN_NUM: 100,
    /**
     * 初始化词库.
     * 
     * <p>
     *   <ol>
     *     <li>如果没有初始化数据库，先初始化数据库</li>
     *     <li>将 /resources/classes/ 下的 *.zip 词库包导入到数据库中</li>
     *     <li>生成客户端标识</li>
     *   </ol>
     * </p>
     * 
     * @returns {undefined}
     */
    initClasses: function () {
        dbs.initDB(function () { // 确实初始化过数据库（第一次安装）时执行
            console.info('开始导入默认词库');

            clazz.importClass('11');
            clazz.importClass('12');

            // 生成 Wordman 客户端标识
            dbs.wordman();

            var timer = setTimeout(function () {
                $('#setup').remove();
                window.location = "#lexicon-list";
            }, 10000);

            setTimeout(function () {
                document.getElementById("setup").addEventListener("touchend", function (event) {
                    window.clearTimeout(timer);

                    $('#setup').remove();
                    window.location = "#lexicon-list";
                });
            }, 5000);

            return;
        });
    },
    /**
     * 导入指定的词库.
     * 
     * @param {String} clazzId 指定的词库 id
     * @param {Function} cb 回调（可选）
     * @returns {undefined}
     */
    importClass: function (clazzId, cb) {
        var db = dbs.openDatabase();

        JSZipUtils.getBinaryContent('resources/classes/' + clazzId + '.zip', function (err, data) {
            if (err) {
                console.error('加载词库异常', err);

                throw err;
            }

            var zip = new JSZip(data);

            var initClassSqls = zip.file('class.sql').asText().split('--B3WmSQL--');
            db.transaction(function (tx) {
                for (var i in initClassSqls) {
                    tx.executeSql(initClassSqls[i], [], null, function (tx, err) {
                        console.error('导入词库 [' + clazzId + '] 异常 [' + tx + ']', err);

                        throw err;
                    });
                }
            }, null, function () { // 导入词库事务成功后更新词库状态为【2已安装】
                db.transaction(function (tx) {
                    tx.executeSql('update class set state = 2 where id = ?', [clazzId]);
                });

                console.info('已导入词库 [' + clazzId + ']');

                if (cb && (typeof (cb)).toLowerCase() === "function") {
                    cb();
                }
            });
        });
    },
    /**
     * 获取指定词库的单词数.
     * 
     * @param {String} classId 指定词库 id
     * @param {Function} cb 回调
     * @returns {undefined}
     */
    countWord: function (classId, cb) {
        var db = dbs.openDatabase();

        db.transaction(function (tx) {
            tx.executeSql('select size from class where id = ?', [classId], function (tx, result) {
                cb(result.rows.item(0).size);
            });
        });
    },
    /**
     * 所有词库一共单词计数.
     * 
     * @param {Function} cb 回调
     * @returns {undefined}
     */
    countWords: function (cb) {
        var db = dbs.openDatabase();

        db.transaction(function (tx) {
            tx.executeSql('select sum(size) as c from class', [], function (tx, result) {
                cb(result.rows.item(0).c);
            }, function (tx, err) {
                console.error(err);
            });
        });
    },
    /**
     * 获取所有词库列表.
     * 
     * <p>
     * 回调实参：
     * <pre>
     * [{
     *     id: "12",
     *     name: "六级必备词汇",
     *     size: 2087,
     *     state: 2, // 0: 未下载，1：已下载未安装，2：已安装
     *     times: 1,
     *     selected: true,
     *     learned: 500, 
     *     finished: 300, 
     *     toLearns: 2, // 今天需要学习的课程数
     *     toReviews: 3 // 今天需要复习的课程数
     * }, {
     *     id: "16",
     *     name: "GRE考试必备词汇",
     *     size: 7496,
     *     state: 1,
     *     times: 0,
     *     selected: false,
     *     learned: 0, 
     *     finished: 0, 
     *     toLearns: 0,
     *     toReviews: 0
     * }]
     * </pre>
     * </p>
     * 
     * @param {Function} cb 回调
     * @returns {undefined}
     */
    getClasses: function (cb) {
        var classes = [];

        var db = dbs.openDatabase();

        db.transaction(function (tx) {
            tx.executeSql('select * from class order by selected desc, id asc', [], function (tx, result) {
                for (var i = 0; i < result.rows.length; i++) {

                    clazz.countClassPlans(result.rows.item(i), i, function (clz, length) {
                        classes.push(clz);

                        if (length === result.rows.length - 1) {
                            cb(classes);
                        }
                    });
                }
            });
        });
    },
    /**
     * 获取指定词库今天的学习与复习计划课程数.
     * 
     * <p>
     * 用户可能会推迟学习，比如本来应该昨天学习完一课的，但是推迟到今天，那这个计数应该返回 2。
     * </p>
     * 
     * <p>
     * 回调实参：
     * <pre>
     * {
     *     ....: .... // class 词库行记录 
     *     toLearns: 2, // 今天需要学习的课程数
     *     toReviews: 3 // 今天需要复习的课程数
     * }
     * </pre>
     * </p>
     * 
     * @param {String} clazz 指定的词库
     * @param {Function} cb 回调
     * @param {Number} length 回调实参，用于回调中判断是否返回
     * @returns {undefined}
     */
    countClassPlans: function (clazz, length, cb) {
        var db = dbs.openDatabase();

        db.transaction(function (tx) {
            tx.executeSql('select count(*) as c from learn_plan where classId = ? and date <= ? and done is null', [clazz.id, new Date().format('yyyyMMdd')], function (tx, result) {
                var ret = clazz;

                ret.toLearns = result.rows.item(0).c

                db.transaction(function (tx) {
                    tx.executeSql('select count(*) as c from review_plan where classId = ? and date <= ? and done is null', [clazz.id, new Date().format('yyyyMMdd')], function (tx, result) {
                        ret.toReviews = result.rows.item(0).c;

                        cb(ret, length);
                    });
                });
            });
        });
    },
    /**
     * 指定词库“选定”状态.
     * 
     * <p>
     * 回调实参：
     * <pre>
     * {
     *     selected: true, 
     *     learnNum: 25, 
     * }
     * </pre>
     * </p>
     * 
     * @param {String} clazzId 指定词库 id
     * @param {Function} cb 回调
     * @returns {undefined}
     */
    selectState: function (clazzId, cb) {
        var db = dbs.openDatabase();

        db.transaction(function (tx) {
            tx.executeSql('select selected from class where id = ?', [clazzId], function (tx, result) {
                var ret = {};
                ret.selected = result.rows.item(0).selected;

                db.transaction(function (tx) {
                    tx.executeSql('select * from learn_plan where classId = ? order by date limit 1', [clazzId], function (tx, result) {
                        // 第一次学习时使用默认学习词数
                        ret.learnNum = clazz.DEFAULT_LEARN_NUM;

                        if (result.rows.length > 0) {
                            ret.learnNum = result.rows.item(0).wordIds.split(',').length;
                        }

                        cb(ret);
                    });
                });
            });
        });
    },
    /**
     * 获取今天指定词库的一课学习计划.
     * 
     * <p>
     * 回调实参（今天学习一课的单词列表）：
     * <pre>
     * {
     *     planId: "1234",
     *     words: [{
     *         id: "342", 
     *         word: "cloak",
     *         phon: "[klok]",
     *         ....
     *     }, ....]
     * }
     * </pre>
     * </p>
     * 
     * @param {String} clazzId 词库 id
     * @param {Number} learnNum 学习单词数
     * @param {Function} cb 回调
     * @returns {undefined}
     */
    getLearnPlans: function (classId, learnNum, cb) {
        var classSize;

        async.series([
            function (callback) {
                clazz.countWord(classId, function (count) {
                    classSize = count;

                    callback();
                });
            },
            function (callback) {
                var db = dbs.openDatabase();

                db.transaction(function (tx) {
                    var today = new Date().format('yyyyMMdd');
                    tx.executeSql('select * from learn_plan where classId = ? and date <= ? and done is null order by date asc limit 1', [classId, today], function (tx, result) {
                        var lastLearnNum = 0;

                        if (result.rows.length > 0) {
                            lastLearnNum = result.rows.item(0).wordIds.split(',').length;
                        }

                        if (0 !== lastLearnNum) { // 早已经开始学习该词库
                            callback();

                            return;
                        }

                        // 首次学习时无学习计划

                        var count = 0;
                        var db = dbs.openDatabase();

                        // 新建新计划
                        db.transaction(function (tx) {
                            var pageNum = Math.ceil(classSize / learnNum);
                            var day = 0;
                            
                            // 课程序号
                            var num = 1;
                            
                            for (var i = 0; i < pageNum; i++) {
                                tx.executeSql('select id from word_' + classId + ' limit ?, ?', [i * learnNum, learnNum],
                                        function (tx, result) {
                                            var date = new Date();
                                            date.setDate(date.getDate() + day++);

                                            var wordIds = [];
                                            // 组装 wordIds 字段
                                            for (var i = 0; i < result.rows.length; i++) {
                                                var word = result.rows.item(i);

                                                wordIds.push("'" + word.id + "'");
                                            }

                                            // 保存对该词库一天（一课）的学习计划
                                            tx.executeSql('insert into learn_plan values (?, ?, ?, ?, ?, ?)', [dbs.genId(), num, classId, '(' + wordIds.toString() + ')', date.format('yyyyMMdd'), null],
                                                    function (tx, result) {
                                                        count++;

                                                        if (count >= 2) { // 生成完毕 2 课
                                                            // 先返回，剩余的还在异步执行
                                                            callback();
                                                        }
                                                    },
                                                    function (tx, err) {
                                                        console.error('生成学习计划异常', err);

                                                        throw err;
                                                    }
                                            );
                                    
                                            ++num;
                                        }
                                );
                            }
                        });
                    });
                });
            },
            function (callback) {
                var words = [];

                // 返回今天需要学习的单词列表
                var db = dbs.openDatabase();

                db.transaction(function (tx) {
                    tx.executeSql('select * from learn_plan where classId = ? and date <= ? and done is null order by date asc limit 1', [classId, new Date().format('yyyyMMdd')], function (tx, result) {
                        var plan = result.rows.item(0);

                        db.transaction(function (tx) {
                            tx.executeSql('select * from word_' + classId + ' where id in ' + plan.wordIds, [], function (tx, result) {
                                for (var i = 0; i < result.rows.length; i++) {
                                    words.push(result.rows.item(i));
                                }

                                cb({
                                    planId: plan.id,
                                    words: words,
                                    num: plan.num   // 课程序号
                                });
                            }, function (tx, err) {
                                console.error(err);
                            });
                        });
                    });
                });

                callback();
            }
        ]);
    },
    /**
     * 获取今天指定词库的一课复习计划.
     * 
     * <p>
     * 回调实参（今天复习一课的单词列表）：
     * <pre>
     * {
     *     planId: "1234",
     *     words: [{
     *         id: "342", 
     *         word: "cloak",
     *         phon: "[klok]",
     *         ....
     *     }, ....]
     * }
     * </pre>
     * </p>
     * 
     * @param {String} clazzId 词库 id
     * @param {Function} cb 回调
     * @returns {undefined}
     */
    getReviewPlans: function (classId, cb) {
        var words = [];

        var db = dbs.openDatabase();

        db.transaction(function (tx) {
            tx.executeSql('select * from review_plan where classId = ? and date <= ? and done is null order by date asc limit 1', [classId, new Date().format('yyyyMMdd')], function (tx, result) {
                var plan = result.rows.item(0);

                db.transaction(function (tx) {
                    tx.executeSql('select * from word_' + classId + ' where id in ' + plan.wordIds, [], function (tx, result) {
                        for (var i = 0; i < result.rows.length; i++) {
                            words.push(result.rows.item(i));
                        }

                        cb({
                            planId: plan.id,
                            words: words,
                            roundNum: plan.roundNum,
                            num: plan.num
                        });
                    }, function (tx, err) {
                        console.error(err);
                    });
                });
            });
        });
    },
    /**
     * “选定”指定的词库.
     * 
     * @param {String} classId 指定的词库 id
     * @returns {undefined}
     */
    selectClass: function (classId) {
        var db = dbs.openDatabase();

        db.transaction(function (tx) {
            tx.executeSql('update class set selected = 1 where id = ?', [classId]);
            tx.executeSql('select times from class where id = ?', [classId], function (tx, result) {
                var times = result.rows.item(0).times;

                db.transaction(function (tx) {
                    tx.executeSql('update class set times = ? where id = ?', [++times, classId]);
                });
            });
        });
    },
    /**
     * 完成指定词库的指定学习计划，生成相应的复习计划.
     * 
     * @param {String} classId 指定词库 id
     * @param {String} planId 指定学习计划 id
     * @returns {undefined}
     */
    finishLearn: function (classId, planId) {
        var db = dbs.openDatabase();

        db.transaction(function (tx) {
            tx.executeSql('select * from learn_plan where classId = ? and id = ? limit 1', [classId, planId], function (tx, result) {
                var learnPlan = result.rows.item(0);
                var learned = learnPlan.wordIds.split(',').length;

                db.transaction(function (tx) {
                    tx.executeSql('select learned from class where id = ?', [classId], function (tx, result) {
                        var l = result.rows.item(0).learned;

                        db.transaction(function (tx) {
                            tx.executeSql('update class set learned = ? where id = ?', [l + learned, classId]);
                        });
                    }, function (tx, error) {
                        console.error(error);
                    });

                    tx.executeSql('update learn_plan set done = ? where classId = ? and id = ?', [new Date().format('yyyyMMdd'), classId, planId]);

                    // 复习轮 id
                    var roundId = dbs.genId();
                    
                    // 复习轮序号
                    var num = 1;

                    // 生成复习计划（+1、2、4、7、15 天）
                    var day = new Date();
                    day.setDate(day.getDate() + 1);
                    var day1 = day.format('yyyyMMdd');
                    genReviewPlans(learnPlan.num, num++, classId, roundId, learnPlan.wordIds, day1);

                    day.setDate(day.getDate() + 1);
                    var day2 = day.format('yyyyMMdd');
                    genReviewPlans(learnPlan.num, num++, classId, roundId, learnPlan.wordIds, day2);

                    day.setDate(day.getDate() + 2);
                    var day4 = day.format('yyyyMMdd');
                    genReviewPlans(learnPlan.num, num++, classId, roundId, learnPlan.wordIds, day4);

                    day.setDate(day.getDate() + 3);
                    var day7 = day.format('yyyyMMdd');
                    genReviewPlans(learnPlan.num, num++, classId, roundId, learnPlan.wordIds, day7);

                    day.setDate(day.getDate() + 8);
                    var day15 = day.format('yyyyMMdd');
                    genReviewPlans(learnPlan.num, num++, classId, roundId, learnPlan.wordIds, day15);
                });
            });
        });
    },
    /**
     * 完成指定词库的指定复习计划.
     * 
     * @param {String} classId 指定词库 id
     * @param {String} planId 指定复习计划 id
     * @returns {undefined}
     */
    finishReview: function (classId, planId) {
        var db = dbs.openDatabase();

        db.transaction(function (tx) {
            tx.executeSql('update review_plan set done = ? where classId = ? and id = ?', [new Date().format('yyyyMMdd'), classId, planId]);

            db.transaction(function (tx) {
                tx.executeSql('select * from review_plan where classId = ? and id = ?', [classId, planId], function (tx, result) {
                    var roundId = result.rows.item(0).roundId;
                    var words = result.rows.item(0).wordIds.split(',').length;

                    db.transaction(function (tx) {
                        tx.executeSql('select count(*) as c from review_plan where roundId = ? and done is not null', [roundId], function (tx, result) {
                            var count = result.rows.item(0).c;

                            if (5 === count) { // 艾宾浩斯一轮一共 5 次，都有 done 日期的话说明这一轮已经结束了
                                db.transaction(function (tx) {
                                    tx.executeSql('select finished from class where id = ?', [classId], function (tx, result) {
                                        var f = result.rows.item(0).finished;

                                        db.transaction(function (tx) {
                                            tx.executeSql('update class set finished = ? where id = ?', [f + words, classId]);
                                        });
                                    }, function (tx, error) {
                                        console.error(error);
                                    });
                                });
                            }
                        });
                    });
                });
            });
        });
    },
    /**
     * 新加一个生词.
     * 
     * @param {String} wordId 指定的单词 id
     * @param {String} classId 指定的词库 id
     * @returns {undefined}
     */
    addNewWord: function (wordId, classId) {
        var db = dbs.openDatabase();

        db.transaction(function (tx) {
            tx.executeSql('insert into new_word values (?, ?, ?)', [dbs.genId(), wordId, classId],
                    function (tx, result) {
                    },
                    function (tx, err) {
                        console.error('新加生词异常', err);

                        throw err;
                    }
            );
        });
    },
    /**
     * 移除一个生词.
     * 
     * @param {String} wordId 指定的单词 id
     * @param {String} classId 指定的词库 id
     * @returns {undefined}
     */
    removeNewWord: function (wordId, classId) {
        var db = dbs.openDatabase();

        db.transaction(function (tx) {
            tx.executeSql('delete from new_word where wordId = ? and classId = ?', [wordId, classId],
                    function (tx, result) {
                    },
                    function (tx, err) {
                        console.error('移除生词异常', err);

                        throw err;
                    }
            );
        });
    },
    /**
     * 返回生词列表（不分页）.
     * 
     * <p>
     * 回调实参：
     * <pre>
     * {
     *     words: [{
     *         id: "342", 
     *         word: "cloak",
     *         phon: "[klok]",
     *         ....
     *     }, ....]
     * }
     * </pre>
     * </p>
     * 
     * @param {Function} cb 回调
     * @returns {undefined}
     */
    getNewWords: function (cb) {
        var db = dbs.openDatabase();

        db.transaction(function (tx) {
            tx.executeSql('select * from new_word', [], function (tx, result) {
                var newWords = {};

                for (var i = 0; i < result.rows.length; i++) {
                    var newWord = result.rows.item(i);


                    if (!newWords["_" + newWord.classId]) {
                        newWords["_" + newWord.classId] = [];
                    }

                    newWords["_" + newWord.classId].push("'" + newWord.wordId + "'");
                }

                var words = [];
                var length = Object.getOwnPropertyNames(newWords).length;
                var i = 0;

                db.transaction(function (tx) {
                    for (var classId in newWords) {
                        var wordIds = newWords[classId];
                        i++;
                        tx.executeSql('select * from word' + classId + ' where id in (' + wordIds + ')', [], function (tx, result) {
                            for (var j = 0; j < result.rows.length; j++) {
                                words.push(result.rows.item(j));
                            }

                            if (i === length) {
                                cb({
                                    words: words
                                });
                            }
                        }, function (tx, err) {
                            console.error(err);
                        });
                    }
                });
            }, function (tx, err) {
                console.error(err);
            });
        });
    }
};

function genReviewPlans(num, roundNum, classId, roundId, wordIds, date) {
    var db = dbs.openDatabase();

    db.transaction(function (tx) {
        tx.executeSql('insert into review_plan values (?, ?, ?, ?, ?, ?, ?, ?)', [dbs.genId(), num, roundNum, roundId, classId, wordIds, date, null],
                function (tx, result) {
                },
                function (tx, err) {
                    console.error('生成复习计划异常', err);

                    throw err;
                }
        );
    });
}

// 对Date的扩展，将 Date 转化为指定格式的String   
// 月(M)、日(d)、小时(h)、分(m)、秒(s)、季度(q) 可以用 1-2 个占位符，   
// 年(y)可以用 1-4 个占位符，毫秒(S)只能用 1 个占位符(是 1-3 位的数字)   
// 例子：   
// (new Date()).Format("yyyy-MM-dd hh:mm:ss.S") ==> 2006-07-02 08:09:04.423   
// (new Date()).Format("yyyy-M-d h:m:s.S")      ==> 2006-7-2 8:9:4.18   
Date.prototype.format = function (fmt)
{ //author: meizz   
    var o = {
        "M+": this.getMonth() + 1, //月份   
        "d+": this.getDate(), //日   
        "h+": this.getHours(), //小时   
        "m+": this.getMinutes(), //分   
        "s+": this.getSeconds(), //秒   
        "q+": Math.floor((this.getMonth() + 3) / 3), //季度   
        "S": this.getMilliseconds()             //毫秒   
    };
    if (/(y+)/.test(fmt))
        fmt = fmt.replace(RegExp.$1, (this.getFullYear() + "").substr(4 - RegExp.$1.length));
    for (var k in o)
        if (new RegExp("(" + k + ")").test(fmt))
            fmt = fmt.replace(RegExp.$1, (RegExp.$1.length == 1) ? (o[k]) : (("00" + o[k]).substr(("" + o[k]).length)));
    return fmt;
}
