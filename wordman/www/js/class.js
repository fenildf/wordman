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
 * @version 1.1.0.0, May 12, 2014
 * @since 1.0.0
 */

"use strict";

// 词库操作封装
var clazz = {
    /**
     * 初始化词库.
     * 
     * <p>
     * 将 /resources/classes/ 下的 *.zip 词库包导入到数据库中。
     * </p>
     * 
     * @returns {undefined}
     */
    initClasses: function() {
        this.dropTables();

        var db = dbs.openDatabase();
        db.transaction(function(tx) {
            tx.executeSql("select 1 from option", [], function(tx, result) {
                console.debug('已经初始化过词库了');

                clazz.countWords(function(count) {
                    console.info('所有词库单词计数 [' + count + ']');
                });

                return;
            }, function(tx, err) {
                if (5 !== err.code) { // 非“表不存在”异常
                    console.error(err);

                    throw err;
                }

                // option 表不存在，说明是第一次使用，进行数据库初始化

                $.get('resources/sql/install/1.0.0.sql', function(data) { // 获取建表语句
                    db.transaction(function(tx) {
                        console.info('第一次使用，初始化数据库');
                        var index = 0;
                        var createTableSqls = data.split('----');
                        for (var i in createTableSqls) {
                            tx.executeSql(createTableSqls[i], [], function(tx, result) {
                                index++;
                                if (index === (createTableSqls.length - 1)) { // 最后一个表建表完毕
                                    console.info('建表完毕，开始导入默认词库');

                                    // 导入默认的词库
                                    clazz.importClass('1');
                                    clazz.importClass('2');
                                    // TODO: 加载默认词库
//                                    clazz.importClass('3');
//                                    clazz.importClass('4');
//                                    clazz.importClass('5');
//                                    clazz.importClass('6');
//                                    clazz.importClass('7');
//                                    clazz.importClass('8');
                                }
                            }, function(tx, err) {
                                console.error(err);
                            });
                        }
                    });
                });
            });
        });
    },
    /**
     * 导入指定的词库.
     * 
     * @param {type} clazz 指定的词库
     * @returns {undefined}
     */
    importClass: function(clazz) {
        var db = dbs.openDatabase();

        var own = this;

        JSZipUtils.getBinaryContent('resources/classes/' + clazz + '.zip', function(err, data) {
            if (err) {
                console.error('加载词库异常', err);

                throw err;
            }

            var zip = new JSZip(data);

            var initClassSqls = zip.file('class.sql').asText().split('----');
            db.transaction(function(tx) {
                for (var i in initClassSqls) {
                    tx.executeSql(initClassSqls[i], [], function(tx, result) {
                    }, function(tx, error) {
                        console.error('导入词库 [' + clazz + '] 异常 [' + tx + ']', error);
                    });
                }

                console.info('初始化词库 [' + clazz + '] 完毕');
            });
        });
    },
    /**
     * 获取指定词库的单词数.
     * 
     * @param {String} clazz 指定词库
     * @param {Function} cb 回调
     * @returns {undefined}
     */
    countWord: function(clazz, cb) {
        var db = dbs.openDatabase();

        db.transaction(function(tx) {
            tx.executeSql('select size from class where name = ?', [clazz], function(tx, result) {
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
    countWords: function(cb) {
        var db = dbs.openDatabase();

        db.transaction(function(tx) {
            tx.executeSql('select count(*) as c from word', [], function(tx, result) {
                cb(result.rows.item(0).c);
            }, function(tx, err) {
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
     *     times: 1,
     *     selected: true,
     *     learned: 500, 
     *     finished: 300, 
     * }, ....]
     * </pre>
     * </p>
     * 
     * @param {Function} cb 回调
     * @returns {undefined}
     */
    getClasses: function(cb) {
        var classes = [];

        var db = dbs.openDatabase();

        db.transaction(function(tx) {
            tx.executeSql('select * from class', [], function(tx, result) {
                for (var i = 0; i < result.rows.length; i++) {
                    classes.push(result.rows.item(i));
                }

                cb(classes);
            });
        });
    },
    /**
     * 进行学习计划.
     * 
     * <ol>
     *   <li>
     *   当用户<i>选定</i>了一个要学习的词库后，使用 DEFAULT_LEARN_NUM 个单词为一课/天生成学习计划（对于同一词库，一天只能学习一课，默认是 
     *   DEFAULT_LEARN_NUM 个单词）
     *   </li>
     *   <li>
     *   用户每天学习一个词库时可以设置今天学习该词库的单词数（[20, 200]），设定完毕后将使用该单词数为默认单词数调整后续学习计划
     *   </li>
     * </ol>
     * 
     * @param {String} clazz 词库
     * @param {Number} learnNum 学习单词数
     * @param {Function} cb 回调
     * @returns {undefined}
     */
    planLearn: function(clazz, learnNum, cb) {
        // 第一次对某词库进行学习计划认为是选定了该词库，此时用每课 DEFAULT_LEARN_NUM 个单词进行学习计划


    },
    /**
     * 删除所有表，仅用于开发阶段.
     * 
     * @returns {undefined}
     */
    dropTables: function() {
        var db = dbs.openDatabase();

        db.transaction(function(tx) {
            tx.executeSql('drop table class');
            tx.executeSql('drop table classwords');
            tx.executeSql('drop table option');
            tx.executeSql('drop table word');
        });

        console.info('删除所有表完毕');
    }


};



