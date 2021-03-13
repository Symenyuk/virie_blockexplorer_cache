const express = require('express');
const app = express();
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const axios = require('axios');
const JSONbig = require('json-bigint');
const log = require('./lib/logger');

let config = fs.readFileSync("./config.json", 'utf8');
config = JSON.parse(config);
const api = config.api + '/json_rpc';
const front_port = config.front_port;

app.use(express.static('dist'));
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  next();
});

const maxCount = 1000;
const serverTimeout = 30;
const syncInterval = 10000; // 10s
const deleteOffersInterval = 43200000; // 12 hours

let db = new sqlite3.Database('db');
db.configure('busyTimeout', 30000);

let getData = require('./lib/api')(app, api, axios, JSONbig);
require('./lib/create_db_tables')(db);

app.get('/get_info', (req, res) => {
  daemonInfo.DBlastBlock = DBlastBlock.height;
  res.send(JSON.stringify(daemonInfo));
});

// FETCHING DATA FROM A DATABASE
// Blockchain page
app.get('/get_blocks_details/:start/:count', (req, res) => {
  let start = req.params.start;
  let count = req.params.count;

  if (start && count) {
    db.serialize(() => {
      db.all("SELECT blocks.* FROM blocks " +
        "WHERE blocks.height >= ? " +
        "ORDER BY blocks.height ASC " +
        "LIMIT ?;", [start, count], (err, rows) => {
        res.send(JSON.stringify(rows));
      });
    });
  } else {
    log.error("Error. Need 'start || count' params");
  }
});
app.get('/get_main_block_details/:id', (req, res) => {
  let id = req.params.id;
  if (id) {
    db.serialize(() => {
      db.get("SELECT b2.id as next_id, b1.* FROM blocks as b1 left join blocks as b2 on b2.height > b1.height WHERE b1.id == ? ORDER BY b2.height ASC LIMIT 1;", [id], (err, row) => {
        if (row) {
          db.all("SELECT * FROM transactions WHERE keeper_block == ? ;", [row.height], (err2, rows2) => {
            for (let i = 0; i < rows2.length; i++) {
              rows2[i].extra = JSON.parse(rows2[i].extra);
              rows2[i].ins = JSONbig(rows2[i].ins);
              rows2[i].outs = JSONbig(rows2[i].outs);
              rows2[i].attachments = JSON.parse(rows2[i].attachments);
            }
            row.transactions_details = rows2;
            res.send(JSON.stringify(row));
          });
        } else {
          log.error('block not found');
        }
      });
    });
  } else {
    log.error("Error. Need 'id' params");
  }
});
app.get('/get_tx_pool_details/:count', (req, res) => {
  let count = req.params.count;
  if (count) {
    db.serialize(() => {
      db.all("SELECT * FROM pool ORDER BY timestamp DESC limit ?", [count], (err, rows) => {
        res.send(JSON.stringify(rows));
      });
    });
  } else {
    log.error("Error. Need 'count' params");
  }
});

// Alt-blocks
app.get('/get_alt_blocks_details/:offset/:count', (req, res) => {
  let offset = req.params.offset;
  let count = req.params.count;
  if (offset && count) {
    if (count > maxCount) {
      count = maxCount;
    }
    db.all("SELECT * FROM alt_blocks ORDER BY height DESC limit ? offset ?", [count, offset], (err, rows) => {
      res.send(JSON.stringify(rows));
    });
  } else {
    log.error("Error. Need 'offset || count' params");
  }
});

app.get('/get_alt_block_details/:id', (req, res) => {
  let id = req.params.id;
  if (id) {
    db.get("SELECT * FROM alt_blocks WHERE hash == ? ;", [id], (err, row) => {
      res.send(JSON.stringify(row));
    });
  } else {
    log.error("Error. Need 'id' params");
  }
});

// Transactions
app.get('/get_tx_details/:tx_hash', (req, res) => {
  let tx_hash = req.params.tx_hash;
  if (tx_hash) {
    db.serialize(() => {
      db.all("SELECT transactions.*, blocks.id as block_hash, blocks.timestamp as block_timestamp FROM transactions LEFT JOIN blocks ON transactions.keeper_block = blocks.height WHERE transactions.id == ? ;", [tx_hash], (err, row) => {
        if (row.length) {
          res.send(JSON.stringify(row[0]));
        } else {
          return getData.get_tx_details(tx_hash)
            .then(data => {
              res.send(JSON.stringify(data.result.tx_info));
            })
            .catch(err => {
              log.error("Error. Need 'tx_hash' param");
            })
        }
      });
    });
  } else {
    log.error("Error. Need 'tx_hash' params");
  }
});
app.get('/get_out_info/:amount/:i', (req, res) => {
  let amount = req.params.amount;
  let i = req.params.i;

  if (amount !== undefined && i !== undefined) {
    db.get("SELECT * FROM out_info WHERE amount = ? AND i = ?", [amount, i], (err, row) => {
      if (row === undefined) {
        getData.get_out_info(amount, i)
          .then(data => {
            res.send(JSON.stringify({tx_id: data.result.tx_id}));
          })
          .catch(err => {
            log.error('get_out_info failed', err)
          })
      } else {
        res.send(JSON.stringify(row));
      }
    });
  } else {
    log.error("Error. Need 'amount || i' params");
  }

});

// Aliases
app.get('/get_aliases/:offset/:count/:search', (req, res) => {
  let offset = req.params.offset;
  let count = req.params.count;
  let search = req.params.search;
  if (count > maxCount) {
    count = maxCount;
  }
  if (search === 'all' && offset !== undefined && count !== undefined) {
    db.serialize(() => {
      db.all("SELECT * FROM aliases WHERE enabled == 1 ORDER BY block DESC limit ? offset ?", [count, offset], (err, rows) => {
        res.send(JSON.stringify(rows));
      });
    });
  } else if (search !== undefined && offset !== undefined && count !== undefined) {
    db.serialize(() => {
      db.all("SELECT * FROM aliases WHERE enabled == 1 AND (alias LIKE '%" + search + "%' OR address LIKE '%" + search + "%' OR comment LIKE '%" + search + "%') ORDER BY block DESC limit ? offset ?", [count, offset], (err, rows) => {
        res.send(JSON.stringify(rows));
      });
    });
  } else {
    log.error("Error. Need 'search || offset || count' params");
  }
});

// Offers
app.post('/get_offers', (req, res) => {
  var body = [];
  req.on('data', (chunk) => {
    body.push(chunk);
  }).on('end', () => {
    if (!body.length) {
      res.writeHead(400, headers);
      res.end("Error. Need 'offset' and 'count' and 'type' params");
      return;
    }
    body = Buffer.concat(body).toString();
    var params_object = JSON.parse(body);
    if (params_object.offset !== undefined && params_object.count !== undefined && params_object.type !== undefined) {
      if (params_object.count > maxCount) {
        params_object.count = maxCount;
      }

      if (params_object.sortingField !== 'rate') params_object.sortingField = 'm1.' + params_object.sortingField;
      if (params_object.sortingDirect) {
        params_object.sortingDirect = 'ASC'
      } else {
        params_object.sortingDirect = 'DESC'
      }

      var where = "";
      if (params_object.keyword !== undefined && params_object.keyword) {
        if (params_object.keyword_only_title !== undefined && params_object.keyword_only_title) {
          where += " AND ( m1.t LIKE '%" + params_object.keyword + "%' )";
        } else {
          where += " AND ( m1.b LIKE '%" + params_object.keyword + "%' OR m1.cnt LIKE '%" + params_object.keyword + "%' OR m1.com LIKE '%" + params_object.keyword + "%' OR m1.lco LIKE '%" + params_object.keyword + "%' OR m1.lci LIKE '%" + params_object.keyword + "%' OR m1.p LIKE '%" + params_object.keyword + "%' OR m1.pt LIKE '%" + params_object.keyword + "%' OR m1.t LIKE '%" + params_object.keyword + "%' )";
        }
      }
      if (params_object.ot !== undefined) {
        if (params_object.ot === 5) {
          where += " AND ( m1.ot IN (2,3) )";
        } else if (params_object.ot === 4) {
          where += " AND ( m1.ot IN (0,1) )";
        } else {
          where += " AND ( m1.ot == '" + params_object.ot + "' )";
        }
      }
      if (params_object.p !== undefined && params_object.p) {
        where += " AND ( m1.p == '" + params_object.p + "' )";
      }
      if (params_object.pt !== undefined) {
        var pt = [];
        if ((params_object.ot === 2 || params_object.ot === 3 || params_object.ot === 5) && params_object.pt.EPS) pt.push("m1.pt LIKE '%EPS%'");
        if ((params_object.ot === 2 || params_object.ot === 3 || params_object.ot === 5) && params_object.pt.BCX) pt.push("m1.pt LIKE '%BCX%'");
        if ((params_object.ot === 2 || params_object.ot === 3 || params_object.ot === 5) && params_object.pt.BTX) pt.push("m1.pt LIKE '%BTX%'");
        if ((params_object.ot === 2 || params_object.ot === 3 || params_object.ot === 5) && params_object.pt.CSH) pt.push("m1.pt LIKE '%CSH%'");
        if ((params_object.ot === 0 || params_object.ot === 1 || params_object.ot === 4) && params_object.pt.HANDS) pt.push("m1.pt LIKE '%HANDS%'");
        if ((params_object.ot === 0 || params_object.ot === 1 || params_object.ot === 4) && params_object.pt.STORAGE) pt.push("m1.pt LIKE '%STORAGE%'");
        if ((params_object.ot === 0 || params_object.ot === 1 || params_object.ot === 4) && params_object.pt.DELIVERY) pt.push("m1.pt LIKE '%DELIVERY%'");
        if (pt.length) where += " AND ( " + pt.join(" AND ") + " )";
      }
      if (params_object.time !== undefined && params_object.time !== 'any') {
        if (params_object.time === '1h') where += " AND (m1.timestamp + 3600) > CAST(strftime('%s', 'now') AS INT)";
        if (params_object.time === '3h') where += " AND (m1.timestamp + 10800) > CAST(strftime('%s', 'now') AS INT)";
        if (params_object.time === '1d') where += " AND (m1.timestamp + 86400) > CAST(strftime('%s', 'now') AS INT)";
        if (params_object.time === '2d') where += " AND (m1.timestamp + 172800) > CAST(strftime('%s', 'now') AS INT)";
        if (params_object.time === '3d') where += " AND (m1.timestamp + 259200) > CAST(strftime('%s', 'now') AS INT)";
        if (params_object.time === '7d') where += " AND (m1.timestamp + 604800) > CAST(strftime('%s', 'now') AS INT)";

        if (params_object.time === 'period' && params_object.time_start !== undefined && params_object.time_start) where += " AND (m1.timestamp > CAST(strftime('%s', '" + params_object.time_start + "') AS INT))";
        if (params_object.time === 'period' && params_object.time_end !== undefined && params_object.time_end) where += " AND (m1.timestamp < CAST(strftime('%s', '" + params_object.time_end + "') AS INT))";
      }
      if (params_object.location !== undefined) {
        if (params_object.location === 'any') {
          where += " AND m1.lco == '000All'";
        } else {
          if (params_object.lco !== '') where += " AND m1.lco == '" + params_object.lco + "'";
          if (params_object.lci !== '') where += " AND m1.lci LIKE '%" + params_object.lci + "%'";
        }
      }
      if (params_object.ap_from !== undefined && params_object.ap_from) {
        where += " AND m1.ap >= '" + (params_object.ap_from * 100000000) + "'";
      }
      if (params_object.ap_to !== undefined && params_object.ap_to) {
        where += " AND m1.ap <= '" + (params_object.ap_to * 100000000) + "'";
      }
      if (params_object.rate_from !== undefined && params_object.rate_from) {
        where += " AND rate >= '" + params_object.rate_from + "'";
      }
      if (params_object.rate_to !== undefined && params_object.rate_to) {
        where += " AND rate <= '" + params_object.rate_to + "'";
      }
      if (params_object.cat !== undefined && params_object.cat) {
        where += " AND m1.cat LIKE '%" + params_object.cat + "%'";
      }

      var select = "";
      if (params_object.ot === 2 || params_object.ot === 3 || params_object.ot === 5) {
        select += ", (CAST(m1.at AS FLOAT)/CAST(m1.ap AS FLOAT)) as rate ";
      }

      db.serialize(() => {
        db.all("SELECT m1.* " + select + " FROM market as m1 left join market as m2 on m2.offers_id == m1.offers_id AND m2.action == 'DEL' WHERE m2.action IS NULL AND (m1.timestamp + (m1.et * 86400)) > CAST(strftime('%s', 'now') AS INT) " + where + " GROUP BY m1.offers_id ORDER BY LOWER(" + params_object.sortingField + ") " + params_object.sortingDirect + " limit ? offset ?", [params_object.count, params_object.offset], (err, rows) => {
          res.send(JSON.stringify(rows));
        });
      });

    } else {
      log.error('get_offers need params');
      res.send("Error. Need 'offset' and 'count' and 'type' params");
    }
  });
});

// Charts
app.get('/get_chart/:chart/:period', (req, res) => {
  let chart = req.params.chart;
  let period = req.params.period; // temporarily unused

  if (chart !== undefined) {
    let period = Math.round(new Date().getTime() / 1000) - (24 * 3600); // + 86400000
    let period2 = Math.round(new Date().getTime() / 1000) - (48 * 3600); // + 86400000

    if (chart === 'all') {
      db.serialize(() => {
        // Charts AvgBlockSize, AvgTransPerBlock, difficultyPoS, difficultyPoW
        db.all("SELECT actual_timestamp as at, block_cumulative_size as bcs, tr_count as trc, difficulty as d, type as t FROM charts WHERE actual_timestamp > " + period, (err, arrayAll) => {
          if (err) {
            log.error('all charts error', err);
          } else {
            // Chart Confirmed Transactions Per Day
            db.all("SELECT actual_timestamp as at, SUM(tr_count) as sum_trc FROM charts GROUP BY strftime('%Y-%m-%d', datetime(actual_timestamp, 'unixepoch')) ORDER BY actual_timestamp;", (err, rows0) => {
              if (err) {
                log.error('all charts confirmed-transactions-per-day', err);
              } else {
                // Chart HashRate
                db.all("SELECT actual_timestamp as at, difficulty120 as d120, hashrate100 as h100, hashrate400 as h400 FROM charts WHERE type=1 AND actual_timestamp > " + period2, (err, rows1) => {
                  if (err) {
                    log.error('all hashrate', err);
                  } else {
                    arrayAll[0] = rows0;
                    arrayAll[1] = rows1;
                    res.send(JSON.stringify(arrayAll));
                  }
                });
              }
            });
          }
        });
      });
    } else if (chart === 'AvgBlockSize') {
      db.serialize(() => {
        db.all("SELECT actual_timestamp as at, block_cumulative_size as bcs FROM charts", (err, rows) => {
          if (err) {
            log.error('AvgBlockSize', err);
          } else {
            res.send(JSON.stringify(rows));
          }
        });
      });
    } else if (chart === 'AvgTransPerBlock') {
      db.serialize(() => {
        db.all("SELECT actual_timestamp as at, tr_count as trc FROM charts", (err, rows) => {
          if (err) {
            log.error('AvgTransPerBlock', err);
          } else {
            res.send(JSON.stringify(rows));
          }
        });
      });
    } else if (chart === 'hashRate') {
      db.serialize(() => {
        db.all("SELECT actual_timestamp as at, difficulty120 as d120, hashrate100 as h100, hashrate400 as h400 FROM charts WHERE type=1", (err, rows) => {
          if (err) {
            log.error('hashrate', err);
          } else {
            res.send(JSON.stringify(rows));
          }
        });
      });
    } else if (chart === 'pos-difficulty') {
      db.serialize(() => {
        db.all("SELECT actual_timestamp as at, difficulty as d FROM charts WHERE type=0", (err, rows) => {
          if (err) {
            log.error('pos-difficulty', err);
          } else {
            res.send(JSON.stringify(rows));
          }
        });
      });
    } else if (chart === 'pow-difficulty') {
      db.serialize(() => {
        db.all("SELECT actual_timestamp as at, difficulty as d FROM charts WHERE type=1", (err, rows) => {
          if (err) {
            log.error('pow-difficulty', err);
          } else {
            res.send(JSON.stringify(rows));
          }
        });
      });
    } else if (chart === 'ConfirmTransactPerDay') {
      db.serialize(() => {
        db.all("SELECT actual_timestamp as at, SUM(tr_count) as sum_trc FROM charts GROUP BY strftime('%Y-%m-%d', datetime(actual_timestamp, 'unixepoch')) ORDER BY actual_timestamp;", (err, rows) => {
          if (err) {
            log.error('ConfirmTransactPerDay', err);
          } else {
            res.send(JSON.stringify(rows));
          }
        });
      });
    }
  } else {
    log.error('get_offers need params');
  }
});

// Search
app.get('/search_by_id/:id', (req, res) => {
  let id = req.params.id;

  if (id) {
    db.get("SELECT * FROM blocks WHERE id == ? ;", [id], (err, row) => {
      if (row === undefined) {
        db.get("SELECT * FROM alt_blocks WHERE hash == ? ;", [id], (err, row) => {
          if (row === undefined) {
            db.get("SELECT * FROM transactions WHERE id == ? ;", [id], (err, row) => {
              if (row === undefined) {
                getData.get_tx_details(id)
                  .then(data => {
                    if (data.result) {
                      res.send(JSON.stringify({result: "tx"}));
                    } else {
                      res.send(JSON.stringify({result: "NOT FOUND"}));
                    }
                  })
                  .catch(err => {
                    res.send(JSON.stringify({result: "NOT FOUND"}));
                  })
              } else {
                res.send(JSON.stringify({result: "tx"}));
              }
            });
          } else {
            res.send(JSON.stringify({result: "alt_block"}));
          }
        });
      } else {
        res.send(JSON.stringify({result: "block"}));
      }
    });
  }
});


// DB SYNCHRONIZATION
let DBlastBlock = {
  height: -1,
  id: "0000000000000000000000000000000000000000000000000000000000000000"
};
let daemonInfo = {};
let statusSyncBlocks = false;

// pool
let countTrPoolServer;
let statusSyncPool = false;

let statusDeleteOffers = false;

// aliases
let countAliasesDB;
let countAliasesServer;

// alt_blocks
let countAltBlocksDB = 0;
let countAltBlocksServer;
let statusSyncAltBlocks = false;


let block_array = [];
let pools_array = [];

let parseComment = (comment) => {
  let splitComment = comment.split(/\s*,\s*/);
  let splitResult = splitComment[4];
  if (splitResult) {
    let result = splitResult.split(/\s*"\s*/);
    let input = result[3].toString();
    if (input) {
      let output = new Buffer(input, 'hex');
      return output.toString();
    } else {
      return "";
    }
  } else {
    return "";
  }
};
let parseTrackingKey = (trackingKey) => {
  let splitKey = trackingKey.split(/\s*,\s*/);
  let resultKey = splitKey[5];
  if (resultKey) {
    let key = resultKey.split(':');
    let keyValue = key[1].replace(/\[|\]/g, '');
    if (keyValue) {
      keyValue.toString();
      keyValue = keyValue.replace(/\s+/g, '');
      return keyValue;
    } else {
      return '';
    }
  } else {
    return '';
  }
};

db.serialize(() => {
  db.run("DELETE FROM alt_blocks");
  db.get("SELECT * FROM blocks WHERE height=(SELECT MAX(height) FROM blocks)", [], (err, row) => {
    if (err) log.error(err);
    if (row) {
      DBlastBlock = row;
    }
    db.get("SELECT COUNT(*) AS alias FROM aliases", (err, row) => {
      if (err) log.error(err);
      if (row) {
        countAliasesDB = row.alias;
      }
      db.get("SELECT COUNT(*) AS height FROM alt_blocks", (err, row) => {
        if (err) log.error(err);
        if (row) {
          countAltBlocksDB = row.height;
        }
        deleteOffers();
        sync();
      });
    });
  });
});

function sync() {
  if (statusDeleteOffers === false) {
    return getData.get_info()
      .then(data => {
        daemonInfo = data.result;
        countAliasesServer = daemonInfo.alias_count;
        countAltBlocksServer = daemonInfo.alt_blocks_count;
        countTrPoolServer = daemonInfo.tx_pool_size;

        // sync block
        if (DBlastBlock.height !== daemonInfo.height - 1 && statusSyncBlocks === false) {
          log.info("need update blocks db=" + DBlastBlock.height + ' server=' + daemonInfo.height);
          statusSyncBlocks = true;
          syncBlocks();
        }

        // sync transaction pool
        if (statusSyncPool === false) {
          db.get("SELECT COUNT(*) AS transactions FROM pool", (err, rows) => {
            if (err) log.error(err);
            if (rows) {
              if (rows.transactions !== countTrPoolServer) {
                log.info("need update pool transactions db=" + rows.transactions + ' server=' + countTrPoolServer);
                syncPool();
              }
            }
          });
        }

        // sync alt-blocks
        if (statusSyncAltBlocks === false) {
          if (countAltBlocksServer !== countAltBlocksDB) {
            log.info("need update alt-blocks db=" + countAltBlocksDB + ' server=' + countAltBlocksServer);
            syncAltBlocks();
          }
        }
      })
      .catch(err => {
        log.error('sync() get_info failed');
        daemonInfo.daemon_network_state = 0;
      });
  }
}

// deletion of an offer that has expired
let deleteOffers = () => {
  db.serialize(() => {
    statusDeleteOffers = true;
    db.run("DELETE FROM 'market' WHERE (timestamp + ((et + 31) * 86400)) < CAST(strftime('%s', 'now') AS INT);");
    db.run("VACUUM;", () => {
      statusDeleteOffers = false;
    });
    log.info('deletion of an offer that has expired');
  });
};

setInterval(() => {
  sync()
}, syncInterval);

setInterval(() => {
  deleteOffers()
}, deleteOffersInterval);


function syncPool() {
  statusSyncPool = true;
  countTrPoolServer = daemonInfo.tx_pool_size;
  if (countTrPoolServer === 0) {
    db.run("DELETE FROM pool");
    statusSyncPool = false;
  } else {
    return getData.get_all_pool_tx_list()
      .then(data => {
        if (data.result.ids) {
          pools_array = (data.result.ids) ? data.result.ids : [];
          db.serialize(() => {
            db.run("DELETE FROM pool WHERE id NOT IN ( '" + pools_array.join("','") + "' );", (err) => {
              if (err) {
                log.error('pool delete', err);
              }
            });
          });

          db.all("SELECT id FROM pool", (err, rows) => {
            if (err) log.error('select id from pool', err);
            var new_ids = [];
            for (var j = 0; j < pools_array.length; j++) {
              var find = false;
              for (var i = 0; i < rows.length; i++) {
                if (pools_array[j] === rows[i].id) {
                  find = true;
                  break;
                }
              }
              if (!find) {
                new_ids.push(pools_array[j]);
              }
            }

            if (new_ids.length) {
              return getData.get_pool_txs_details(new_ids)
                .then(data => {
                  if (data.result && data.result.txs) {
                    db.serialize(() => {
                      db.run("begin transaction");
                      var stmt = db.prepare("INSERT INTO pool VALUES (?,?,?,?)");
                      for (var x in data.result.txs) {
                        stmt.run(
                          data.result.txs[x].blob_size,
                          data.result.txs[x].fee,
                          data.result.txs[x].id,
                          data.result.txs[x].timestamp
                        );
                      }
                      stmt.finalize();
                      db.run("commit");
                      statusSyncPool = false;
                    });
                  } else {
                    statusSyncPool = false;
                  }
                })
                .catch(err => {
                  statusSyncPool = false;
                  log.error('sync pool, get_pool_txs_details', err);
                });
            } else {
              statusSyncPool = false;
            }
          });
        } else {
          statusSyncPool = false;
        }
      })
      .catch(err => {
        db.run("DELETE FROM pool");
        statusSyncPool = false;
        log.error('get_all_pool_tx_list failed', err);
      });
  }
}

function syncBlocks() {
  let count = daemonInfo.height - DBlastBlock.height + 1;
  if (count > 100) {
    count = 100;
  }
  if (count < 0) {
    count = 1;
  }
  return getData.get_blocks_details(DBlastBlock.height + 1, count)
    .then(data => {
      var newBlocks = (data.result && data.result.blocks) ? data.result.blocks : [];
      if (newBlocks.length && DBlastBlock.id === newBlocks[0].prev_id) {
        block_array = newBlocks;

        syncTransactions(function () {
          if (DBlastBlock.height >= daemonInfo.height - 1) {
            statusSyncBlocks = false;
          } else {
            setTimeout(() => {
              syncBlocks();
            }, serverTimeout);
          }
        });
      } else {
        db.serialize(() => {
          var deleteCount = 100;
          log.info("height > " + (parseInt(DBlastBlock.height) - deleteCount) + " deleted");
          db.run("DELETE FROM blocks WHERE height > " + (parseInt(DBlastBlock.height) - deleteCount) + ";");
          db.run("DELETE FROM charts WHERE height > " + (parseInt(DBlastBlock.height) - deleteCount) + ";");
          db.run("DELETE FROM transactions WHERE keeper_block > " + (parseInt(DBlastBlock.height) - deleteCount) + ";");
          db.run("UPDATE aliases SET enabled=1 WHERE transact IN (SELECT transact FROM aliases WHERE alias IN (select alias from aliases where block > " + (parseInt(DBlastBlock.height) - deleteCount) + " ) AND enabled == 0 GROUP BY alias);");
          db.run("DELETE FROM aliases WHERE block > " + (parseInt(DBlastBlock.height) - deleteCount) + ";");
          db.run("DELETE FROM out_info WHERE block > " + (parseInt(DBlastBlock.height) - deleteCount) + ";");
          db.run("DELETE FROM market WHERE block > " + (parseInt(DBlastBlock.height) - deleteCount) + ";");
          db.get("SELECT * FROM blocks WHERE  height=(SELECT MAX(height) FROM blocks)", [], (err, row) => {
            if (row) {
              DBlastBlock = row;
            } else {
              DBlastBlock = {height: -1, id: "0000000000000000000000000000000000000000000000000000000000000000"}
            }
            setTimeout(() => {
              syncBlocks();
            }, serverTimeout);
          });
        });
      }
    })
    .catch(err => {
      log.error('syncBlocks get_blocks_details failed', err);
      statusSyncBlocks = false;
    });
}

function syncTransactions(success) {
  if (block_array.length === 0) {
    success();
  } else {
    var localBl = block_array[0];
    if (localBl.transactions_details.length === 0) {
      if (localBl.tr_out.length === 0) {
        db.serialize(() => {
          db.run("begin transaction");

          // sync charts data
          var hashrate100 = 0;
          if (localBl.type === 1) {
            db.all("SELECT height, actual_timestamp, cumulative_diff_precise FROM charts WHERE type=1", (err, rows) => {
              if (err) {
                log.error('select data charts', err);
              } else {
                for (let i = 0; i < rows.length; i++) {
                  hashrate100 = (i > 99 - 1) ? ((localBl['cumulative_diff_precise'] - rows[rows.length - 100]['cumulative_diff_precise']) / (localBl['actual_timestamp'] - rows[rows.length - 100]['actual_timestamp'])) : 0;
                }
                var stmtCharts = db.prepare("INSERT INTO charts VALUES (?,?,?,?,?,?,?,?,?,?)");
                stmtCharts.run(
                  localBl.height,
                  localBl.actual_timestamp,
                  localBl.block_cumulative_size,
                  localBl.cumulative_diff_precise.toString(),
                  localBl.difficulty.toString(),
                  (localBl.tr_count) ? localBl.tr_count : 0,
                  localBl.type,
                  (localBl.difficulty / 120).toFixed(0),
                  hashrate100,
                  0
                );
                stmtCharts.finalize();
              }
            });
          } else {
            var stmtCharts = db.prepare("INSERT INTO charts VALUES (?,?,?,?,?,?,?,?,?,?)");
            stmtCharts.run(
              localBl.height,
              localBl.actual_timestamp,
              localBl.block_cumulative_size,
              localBl.cumulative_diff_precise.toString(),
              localBl.difficulty.toString(),
              (localBl.tr_count) ? localBl.tr_count : 0,
              localBl.type,
              0,
              0,
              0
            );
            stmtCharts.finalize();
          }

          // sync block data
          var stmt = db.prepare("INSERT INTO blocks VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)");
          stmt.run(
            localBl.height,
            localBl.actual_timestamp,
            localBl.base_reward,
            localBl.block_cumulative_size,
            localBl.cumulative_diff_adjusted,
            localBl.cumulative_diff_precise,
            localBl.difficulty,
            localBl.effective_fee_median,
            localBl.id,
            localBl.is_orphan,
            localBl.penalty,
            localBl.prev_id,
            localBl.summary_reward,
            localBl.this_block_fee_median,
            localBl.timestamp,
            localBl.total_fee,
            localBl.total_txs_size,
            (localBl.tr_count) ? localBl.tr_count : 0,
            localBl.type,
            localBl.miner_text_info
          );
          stmt.finalize();
          DBlastBlock = block_array.splice(0, 1)[0];
          db.run("commit");
        });
        log.info("BLOCKS: db =" + DBlastBlock.height + '/server =' + daemonInfo.height + " transaction left = " + localBl.tr_count);
        setTimeout(() => {
          syncTransactions(success);
        }, serverTimeout);
      } else {
        var localOut = localBl.tr_out[0];
        return getData.get_out_info(JSONbig(localOut.amount), localOut.i)
          .then(data => {
            db.serialize(() => {
              db.run("begin transaction");
              var stmt = db.prepare("REPLACE INTO out_info VALUES (?,?,?,?)");
              stmt.run(
                JSONbig(localOut.amount),
                localOut.i,
                data.result.tx_id,
                localBl.height
              );
              stmt.finalize();
              localBl.tr_out.splice(0, 1);
              db.run("commit");
            });
            log.info("tr_out left = " + localBl.tr_out.length);
            setTimeout(() => {
              syncTransactions(success);
            }, serverTimeout);
          })
          .catch(err => {
            log.error('sync get_out_info()', err);
            statusSyncBlocks = false;
          });
      }
    } else {
      if (localBl.tr_count === undefined) localBl.tr_count = localBl.transactions_details.length;
      if (localBl.tr_out === undefined) localBl.tr_out = [];
      var localTr = localBl.transactions_details.splice(0, 1)[0];

      return getData.get_tx_details(localTr.id)
        .then(data => {
          if (data.result.tx_info) {
            var extra = data.result.tx_info.extra;
            var attachments = data.result.tx_info.attachments;

            for (var item in extra) {
              if (extra[item].type === 'alias_info') {
                db.serialize(() => {
                  var arr = extra[item].short_view.split('-->');
                  var aliasName = arr[0];
                  var aliasAddress = arr[1];
                  var aliasComment = parseComment(extra[item].datails_view);
                  var aliasTrackingKey = parseTrackingKey(extra[item].datails_view);
                  var aliasBlock = localBl.height;
                  var aliasTransaction = localTr.id;
                  db.run("UPDATE aliases SET enabled=0 WHERE alias == '" + aliasName + "';");
                  var stmt = db.prepare("REPLACE INTO aliases VALUES (?,?,?,?,?,?,?)");
                  stmt.run(
                    aliasName,
                    aliasAddress,
                    aliasComment,
                    aliasTrackingKey,
                    aliasBlock,
                    aliasTransaction,
                    1
                  );
                  stmt.finalize();
                });
              }
            }
            if (attachments) {
              for (var itemOffer in attachments) {
                var typeOffer;
                if (attachments[itemOffer].short_view === 'M:ADD') {
                  typeOffer = 'ADD';
                } else if (attachments[itemOffer].short_view === 'M:UPD') {
                  typeOffer = 'UPD';
                } else if (attachments[itemOffer].short_view === 'M:DEL') {
                  typeOffer = 'DEL';
                }

                if (typeOffer) {
                  db.serialize(() => {
                    db.run("begin transaction");
                    var stmt = db.prepare('REPLACE INTO market VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');

                    var offersId;
                    var offerIdCurrent;
                    var block = localBl.height;
                    var tx = localTr.id;
                    var timestamp = localBl.actual_timestamp;

                    var offersBody = {
                      ap: '',
                      at: '',
                      b: '',
                      cat: '',
                      cnt: '',
                      com: '',
                      do: '',
                      et: '',
                      lci: '',
                      lco: '',
                      ot: '',
                      p: '',
                      pt: '',
                      t: ''
                    };

                    if (typeOffer === 'ADD') {
                      offersId = tx + '_' + itemOffer;
                      offerIdCurrent = offersId;
                      offersBody = JSON.parse(attachments[itemOffer].datails_view);
                    } else if (typeOffer === 'UPD') {
                      stmt = db.prepare('REPLACE INTO market VALUES ((select offers_id from market where offer_id_current == ? ),?,?,?,?,(select timestamp from market where offer_id_current == ? ),?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
                      var objectUpd = JSON.parse(attachments[itemOffer].datails_view);
                      offerIdCurrent = tx + '_' + itemOffer;
                      offersId = objectUpd.id + '_' + objectUpd.oi;
                      offersBody = JSON.parse(attachments[itemOffer].datails_view).of;
                      timestamp = offersId;
                    } else if (typeOffer === 'DEL') {
                      stmt = db.prepare('REPLACE INTO market VALUES ((select offers_id from market where offer_id_current == ? ),?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
                      var objectDel = JSON.parse(attachments[itemOffer].datails_view);
                      offerIdCurrent = tx + '_' + itemOffer;
                      offersId = objectDel.id + '_' + objectDel.oi;
                    }

                    stmt.run(
                      offersId, offerIdCurrent, typeOffer, block, tx, timestamp,
                      offersBody.ap, offersBody.at, offersBody.b, offersBody.cat, offersBody.cnt,
                      offersBody.com, offersBody.do, offersBody.et, offersBody.lci, offersBody.lco,
                      offersBody.ot, offersBody.p, offersBody.pt, offersBody.t
                    );
                    stmt.finalize();
                    db.run("commit");
                  });

                }
              }
            }


            // sync transaction data
            var ins = data.result.tx_info.ins;
            for (let item in ins) {
              if (ins[item].global_indexes) {
                localBl.tr_out.push({amount: ins[item].amount, i: ins[item].global_indexes[0]});
              }
            }

            db.serialize(() => {
              db.run("begin transaction");
              var stmt = db.prepare("REPLACE INTO transactions VALUES (?,?,?,?,?,?,?,?,?,?,?)");
              stmt.run(
                data.result.tx_info.keeper_block,
                data.result.tx_info.id,
                data.result.tx_info.amount,
                data.result.tx_info.blob_size,
                JSON.stringify(data.result.tx_info.extra),
                data.result.tx_info.fee,
                JSON.stringify(data.result.tx_info.ins),
                JSON.stringify(data.result.tx_info.outs),
                data.result.tx_info.pub_key,
                data.result.tx_info.timestamp,
                JSON.stringify(data.result.tx_info.attachments)
              );
              stmt.finalize();
              db.run("commit");
            });
            setTimeout(() => {
              log.info("BLOCKS: db =" + localBl.height + '/ server =' + daemonInfo.height + " transaction left = " + localBl.transactions_details.length);
              syncTransactions(success);
            }, serverTimeout);
          }
        })
        .catch(err => {
          log.error('syncTransactions() get_tx_details', err);
          statusSyncBlocks = false;
        });
    }
  }
}

function syncAltBlocks() {
  statusSyncAltBlocks = true;
  db.run("DELETE FROM alt_blocks", () => {

    return getData.get_alt_blocks_details(0, countAltBlocksServer)
      .then(data => {
        db.serialize(() => {
          var stmt = db.prepare('INSERT INTO alt_blocks VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
          for (var x in data.result.blocks) {
            var height = data.result.blocks[x].height;
            var timestamp = data.result.blocks[x].timestamp;
            var actual_timestamp = data.result.blocks[x].actual_timestamp;
            var size = data.result.blocks[x].block_cumulative_size;
            var hash = data.result.blocks[x].id;
            var type = data.result.blocks[x].type;
            var difficulty = data.result.blocks[x].difficulty;
            var cumulative_diff_adjusted = data.result.blocks[x].cumulative_diff_adjusted;
            var cumulative_diff_precise = data.result.blocks[x].cumulative_diff_precise;
            var is_orphan = data.result.blocks[x].is_orphan;
            var base_reward = data.result.blocks[x].base_reward;
            var total_fee = data.result.blocks[x].total_fee;
            var penalty = data.result.blocks[x].penalty;
            var summary_reward = data.result.blocks[x].summary_reward;
            var block_cumulative_size = data.result.blocks[x].block_cumulative_size;
            var this_block_fee_median = data.result.blocks[x].this_block_fee_median;
            var effective_fee_median = data.result.blocks[x].effective_fee_median;
            var total_txs_size = data.result.blocks[x].total_txs_size;
            var transact_details = JSON.stringify(data.result.blocks[x].transactions_details);
            var miner_txt_info = data.result.blocks[x].miner_text_info;
            stmt.run(
              height,
              timestamp,
              actual_timestamp,
              size,
              hash,
              type,
              difficulty,
              cumulative_diff_adjusted,
              cumulative_diff_precise,
              is_orphan,
              base_reward,
              total_fee,
              penalty,
              summary_reward,
              block_cumulative_size,
              this_block_fee_median,
              effective_fee_median,
              total_txs_size,
              transact_details,
              miner_txt_info
            );
          }
          stmt.finalize();
          db.get("SELECT COUNT(*) AS height FROM alt_blocks", (err, rows) => {
            if (err) log.error(err);
            if (rows) {
              countAltBlocksDB = rows.height;
            }
            statusSyncAltBlocks = false;
          });
        });
      })
      .catch(err => {
        statusSyncAltBlocks = false;
        log.error('sync get_alt_blocks_details', err);
      });
  });
}


app.use((req, res) => {
  res.sendFile(__dirname + '/dist/index.html');
});

// Start the server
const server = app.listen(parseInt(front_port), (req, res, error) => {
  if (error) return log.error(`Error: ${error}`);
  log.info(`Server listening on port ${server.address().port}`);
});
