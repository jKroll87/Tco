var express = require('express')
var app = express();
var fs = require('fs');
var https = require('https');
var static = require('serve-static');
var path = require('path')
var body = require('body-parser');
var multer = require('multer');
var mysql = require('mysql2');
var db_config = require('./config/db_config.json');
var session = require('express-session');
const MySQLStore = require('express-mysql-session');
const { json } = require('body-parser');
var mySQLStore = require('express-mysql-session')(session);
var options = {
    host: db_config.host,
    user: db_config.user,
    password: db_config.pw,
    database: db_config.db
};
var sessionStore = new MySQLStore(options);
app.use(session({
    secret: 'anjdlqfurgkwl?',
    resave: false,
    saveUninitialized: true,
    store: sessionStore
}));
// 모든 template에서 session 사용하게 해줌.
app.use(function (req, res, next) {
    res.locals.user = req.session.user;
    res.locals.data = req.session.data;
    next();
});
var connection = mysql.createConnection({
    host: db_config.host,
    user: db_config.user,
    password: db_config.pw,
    database: db_config.db
});
connection.connect();

// 서버 재시작시 세션 초기화
connection.query('DELETE FROM sessions', (err, res, fields) => {
    console.log('CLEARED SESSION');
});
try {
    var option = {
        cert: fs.readFileSync("/home/ubuntu/docker/etc/phpmyadmin/phpmyadmin/ssl/fullchain.pem"),
        key: fs.readFileSync("/home/ubuntu/docker/etc/phpmyadmin/phpmyadmin/ssl/privkey.pem")
    }
    var server = https.createServer(option, app).listen(1919, () => {
        console.log('server has started');
    })
} catch (err) {
    console.log(err);
}

// 이거 있어야 html render 가능
app.set('view engine', 'ejs');
app.engine('html', require('ejs').renderFile);
app.use('/views', static(path.join(__dirname, '/views')));
app.use('/userimg', static(path.join(__dirname, '/uploads')));
//views는 render가 이용한다.
var upload = multer({
    storage: multer.diskStorage({
        destination: (req, file, cb) => {
            cb(null, 'tmpImg/' + req.session.user.id);
        },
        filename: (req, file, cb) => {
            cb(null, file.originalname);
        }
    })
});

app.use('/make', (req, res) => {
    if (!req.session.user) res.redirect('/login')

    req.session.data = {};
    req.session.upload = [];
    connection.query('SELECT EXISTS (SELECT * FROM capsule WHERE id=?) AS bul', [req.session.user.id], (err, result, field) => {
        if (result[0].bul) {
            res.render('main/yescap.ejs')
        } else {
            res.render('main/make.ejs')
        }
    })
})
app.use(body.json());
app.use(body.urlencoded({ extended: true }));
app.use('/uploadImg', upload.any(), (req, res) => {
    console.log(req.files)
    res.send('hihi');
})
app.use('/moveImg', (req, res) => {
    fs.rename('tmpImg/' + req.session.user.id, 'uploads/' + req.session.user.id, (err) => {
        if (err)
            console.log(err);
        res.redirect('/burysuccess');
    })
})
app.use('/ytblinks', (req, res) => {
    if (!req.session.user) res.redirect('/login')

    res.render('main/ytblinks.ejs');
    // res.redirect(307, '/calendar');
})
app.post('/calendar', (req, res) => {
    if (!req.session.user) res.redirect('/login')

    req.session.data.links = req.body.links;
    req.session.save();
    res.render('main/cal.ejs')
})
app.use('/hanbando', (req, res) => {
    if (!req.session.user) res.redirect('/login')

    req.session.data.date = req.body.date;
    req.session.save();
    res.render('main/hanbando.ejs')
})
//post가 없으면 올 수 없는 경로
app.use('/bury', (req, res) => {
    if (!req.session.user) res.redirect('/login')

    if (fs.stat('tmpImg/' + req.body.id, (err) => {
        if (err) {// 존재x
            fs.mkdirSync('tmpImg/' + req.body.id);
        }
    }));

    res.render('main/bury.ejs', {
        data: require('./views/json/' + req.query.area + '.json'),
        area: req.query.area
    });
})

app.get('/letsbury', (req, res) => {
    if (!req.session.user) res.redirect('/login')

    var date = new Date();
    date = date.getFullYear() + '-' + (date.getMonth() + 1) + '-' + date.getDate();
    console.log(req.session.data);
    if (!req.session.data.links)
        req.session.data.links = "";
    else {
        var lnks = "";
        if (typeof (req.session.data.links) == "string")
            lnks = req.session.data.links + ';';
        else
            for (var i = 0; i < req.session.data.links.length; i++) {
                if (req.session.data.links[i] != "")
                    lnks += req.session.data.links[i] + ';';
            }
    }
    connection.query('INSERT INTO capsule(id, ytb_links, d_date, loc, longtitude, latitude, bury_date) VALUES(?,?,?,?,?,?,?)', [req.session.user.id, lnks, req.session.data.date, req.query.loc, req.query.La, req.query.Ma, date], (err, result, field) => {
        if (err) {
            console.log(err)
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end();
        } else {
            delete req.session.data.links;
            delete req.session.data.date;
            res.redirect('/moveImg');
        }
    })
})
app.get('/burysuccess', (req, res) => {
    if (!req.session.user) res.redirect('/login')

    res.render('main/burysuccess.ejs');
})
app.use('/test', (req, res) => {
    res.render('main/test.ejs', {
        data: mapdb
    });
})
app.use('/about', (req, res) => {
    res.render('main/about.ejs');
})
app.use('/mycap', (req, res) => {
    if (!req.session.user) res.redirect('/login')
    connection.query('SELECT EXISTS (SELECT * FROM capsule WHERE id = ?) AS bul', [req.session.user.id], (err, result, field) => {
        if (!result[0].bul)
            // 묻은 캡슐이 없을 경우
            res.render('main/nocab.ejs')
        else {
            // 묻은 캡슐이 존재할 경우
            connection.query('SELECT * FROM capsule WHERE id = ?', [req.session.user.id], (err, result, fields) => {
                var bury_date = result[0].bury_date.split('-')
                var link_cnt;
                if (result[0].ytb_links)
                    link_cnt = result[0].ytb_links.split(';').length - 1;
                else
                    link_cnt = 0;
                var d_date = result[0].d_date.split('-');
                var sch_type;
                if (result[0].loc.indexOf('초등학교') != -1) {
                    sch_type = "초등학교"
                } else if (result[0].loc.indexOf('중학교') != -1) {
                    sch_type = "중학교"
                } else {
                    sch_type = "고등학교"
                }
                //파일 갯수세기
                fs.readdir('uploads/' + req.session.user.id + '/', (err, files) => {
                    var arr = [];
                    files.forEach(file => {
                        arr.push(file);
                    });
                    res.render('main/mycap', {
                        session: req.session.user,
                        bury_date: bury_date,
                        link_cnt: link_cnt,
                        d_date: d_date,
                        sch_type: sch_type,
                        f_len: files.length,
                        pub_priv: result[0].pub_priv,
                        arr: arr
                    });
                })
            })
        }

    })
})
app.post('/updatePubPriv', (req, res) => {
    var pub_priv = 0;
    if (req.body.stat == 'on') {
        pub_priv = 0;
    } else {
        pub_priv = 1;
    }
    connection.query('UPDATE capsule SET pub_priv = ? WHERE id = ?', [pub_priv, req.session.user.id], (err, result, field) => {

    })
    res.end('')
})
app.use('/postcorona', (req, res) => {
    if (!req.session.user) res.redirect('/login')

    connection.query('SELECT ytb_links, loc FROM capsule WHERE id=?', [req.session.user.id], (err, result, field) => {
        if (result.length == 0) {
            res.render('main/nocab.ejs')
        } else {
            var res_link = [], non_link = [];
            if (typeof (result[0].ytb_links) == "string") {
                var links = result[0].ytb_links.split(';');
                for (var i = 0; i < links.length; i++) {
                    //업지 않다면
                    if (links[i].indexOf('youtu.be/') != -1) {
                        if (links[i].indexOf('https') != -1)
                            res_link.push(links[i].substring(17));
                        else
                            res_link.push(links[i].substring(16));
                    } else if (links[i].indexOf('youtube.com/') != -1) {
                        var tmp = links[i].split('?');
                        tmp = tmp[1].split('&');
                        tmp = tmp[0].substring(2);
                        res_link.push(tmp);
                    }
                    else
                        non_link.push(links[i]);
                }
            }
            var arr = [];
            fs.readdir('uploads/' + req.session.user.id, (err, files) => {
                files.forEach(file => {
                    arr.push(file);
                });
                res.render('main/postcorona.ejs', {
                    id: req.session.user.id,
                    img: arr,
                    links: res_link,
                    non_link: non_link,
                    loc: result[0].loc
                })
            });
        }
    })
})
app.use('/easteregg', (req, res) => {
    if (!req.session.user) res.redirect('/login')
    else if(!req.body){
        res.redirect('/')
    }
    else {
        var id = req.session.user.id;
        id = id.replace(/1/g, 'z') // 1->z
        id = id.replace(/2/g, 'g') // 2->g
        id = id.replace(/3/g, 'C') // 3->C
        id = id.replace(/4/g, 'X') // 4->X
        id = id.replace(/8/g, 'a') // 8->a
        id = id.replace(/9/g, '_') // 9->_
        res.render('main/easteregg.ejs', {
            cng_id: id
        });
    }
})
app.use('/postegg', (req, res) => {
    if (!req.session.user) res.redirect('/login')

    var id = req.body.f_code;
    id = id.replace(/z/g, '1') // 1->z
    id = id.replace(/g/g, '2') // 2->g
    id = id.replace(/C/g, '3') // 3->C
    id = id.replace(/X/g, '4') // 4->X
    id = id.replace(/a/g, '8') // 8->a
    id = id.replace(/_/g, '9') // 9->_

    connection.query('SELECT * FROM capsule WHERE id = ?', [id], (err, result, field) => {
        if (result.length == 0) {
            res.render('main/nocab.ejs')
        } else {
            var res_link = [], non_link = [];
            if (typeof (result[0].ytb_links) == "string") {
                var links = result[0].ytb_links.split(';');
                for (var i = 0; i < links.length; i++) {
                    //업지 않다면
                    if (links[i].indexOf('youtu.be/') != -1) {
                        if (links[i].indexOf('https') != -1)
                            res_link.push(links[i].substring(17));
                        else
                            res_link.push(links[i].substring(16));
                    } else if (links[i].indexOf('youtube.com/') != -1) {
                        var tmp = links[i].split('?');
                        tmp = tmp[1].split('&');
                        tmp = tmp[0].substring(2);
                        res_link.push(tmp);
                    }
                    else
                        non_link.push(links[i]);
                }
            }

            var arr = [];
            fs.readdir('uploads/' + id, (err, files) => {
                files.forEach(file => {
                    arr.push(file);
                });
                res.render('main/postegg', {
                    f_code: id,
                    img: arr,
                    links: res_link,
                    non_link: non_link,
                    loc: result[0].loc
                })
            })
        }
    })
})
app.use('/login', (req, res) => {
    // data배열 생성겸 초기화
    req.session.data = {};
    if (req.session.upload) {
    }

    if (!req.session.user)
        res.render('main/login.html');
    else
        res.redirect('back');
})
// 중간처리가 post //
app.post('/chkuser', (req, res) => {
    if (fs.stat('tmpImg/' + req.body.id, (err) => {
        if (err) {// 존재x
            fs.mkdirSync('tmpImg/' + req.body.id);
        }
    }));

    console.log(req.body);
    connection.query('SELECT EXISTS (SELECT id FROM member WHERE id= ?) AS chk', [req.body.id], (err, result, field) => {
        if (result[0].chk) {
            req.session.user = {};
            req.session.user.id = req.body.id;
            req.session.user.name = req.body.name;
            req.session.user.mail = req.body.mail;
            req.session.user.imgurl = req.body.imgurl;
            req.session.save(() => {
                res.redirect('/');
            })
        } else {
            connection.query('INSERT INTO member(id, name, mail, imgurl, date) VALUES(?, ?, ?, ?, ?)', [req.body.id, req.body.name, req.body.mail, req.body.imgurl, new Date().toLocaleString()], (err, result, field) => {
                req.session.user = {};
                req.session.user.id = req.body.id;
                req.session.user.name = req.body.name;
                req.session.user.mail = req.body.mail;
                req.session.user.imgurl = req.body.imgurl;
                req.session.save(() => {
                    res.redirect('/');
                })
            });
        }
    });
})
app.use('/logout', (req, res) => {
    delete req.session.user;
    res.redirect('/');
})
app.use('/mobile', (req, res) => {
    res.render('main/m_make.ejs')
})
app.use('/', (req, res) => {
    if (req.session.user) {
        connection.query('SELECT COUNT(*) as n FROM capsule', (err, results, field) => {
            connection.query('SELECT longtitude, latitude, loc FROM capsule WHERE pub_priv = ?', [0], (err, result, field) => {
                res.render('main/main.ejs', {
                    data: result,
                    n: results[0].n
                })
            })
        })
    } else
        res.redirect('/login')
})
// 맵핑안된것들 에러페이지로
app.all('*', (req, res, next) => {
    res.redirect('/');
})
