'use-strict';
const fs = require('fs');
const path = require('path');
const mkdirp = require('mkdirp');
const glob = require('glob');

const gulp = require('gulp');
const runSequence = require('run-sequence');
const run = require('gulp-run');
const gutil = require('gulp-util');

const render = require('../src/render.js');

const settings = require('../src/settings.js');
const common = require('./lib/common.js');
const paths = settings.paths;

const swig = 'swig';
const flags = '-javascript -node -c++ -DSWIG_TYPE_TABLE=occ.js';
const otherFlags = '-w302,401,314,509,512 -DCSFDB -DHAVE_CONFIG_H -DOCC_CONVERT_SIGNALS'; // TODO:
const include = ['-I/usr/include/node', `-I${settings.oce_include}`];

// Copy hand written swig .i files from src/swig to build/...
gulp.task('copy-user-swig', function(done) {
  // TODO: cmd is completed after task is complete
  return run(`rm -rf ${paths.userSwigDest}`).exec((error) => {
    if (error) return done(error);
    mkdirp.sync(paths.userSwigDest);
    return run(`cp -r ${paths.userSwigSrc}/* ${paths.userSwigDest}`).exec(done);
  });
});

// // Read dependencies from cached pygccxml output TODO: make it a module task
// gulp.task('parse-dependencies', function(done) {
//   const depFile = 'config/depends.json';
//
//   return run(`rm -rf ${depFile}`).exec((error) => {
//     if (error) return done(error);
//     var deps = {};
//     glob.sync(`${paths.headerCacheDest}/*.json`).forEach((file) => {
//       const tree = loadTree(file);
//       const mod = path.basename(file).replace('.json', '');
//       deps[mod] = tree.readDependencies(mod);
//     });
//     fs.writeFile(depFile, JSON.stringify(deps, null, 2), done);
//   });
// });
//
// gulp.task('parse-all-headers', function(done) {
//   common.limitExecution('parse-headers', settings.modules, done);
// });


settings.modules.forEach(function(moduleName) {
  const treePath = `${paths.headerCacheDest}/${moduleName}.json`;
  const configPath = `${paths.configDest}/${moduleName}.json`;
  var depends = settings.depends[moduleName];


  function mTask(name, mName) {
    if (mName === undefined)
      mName = moduleName;
    return common.moduleTask(name, mName);
  }

  gulp.task(mTask('swig-configure'), [mTask('parse')], function(done) {
    run(`rm -f ${configPath}`).exec(function(error) {
      if (error) return done(error);

      var configure = require('../src/configure.js');
      var data = configure(moduleName);

      mkdirp.sync('build/config/');
      var src = JSON.stringify(data, null, 2);
      fs.writeFileSync(configPath, src);
      data = configure.post(moduleName);
      src = JSON.stringify(data, null, 2);
      fs.writeFileSync(configPath, src);
      done();
    });
  });


  function renderSwig(done) {
    run(`rm -rf ${paths.swigDest}/${moduleName}`).exec(function(error) {
      if (error) return done(error);
      render(moduleName);
      return done();
    });
  }

  gulp.task(mTask('swig-render'), [mTask('swig-configure'), 'copy-user-swig'],
    function(done) {
      renderSwig(done);
    });

  const swigDepTasks = [mTask('swig-configure')].concat(mTask('swig-render-deps', depends));
  gulp.task(mTask('swig-render-deps'), swigDepTasks, function(done) {
    renderSwig(done);
  });


  gulp.task(mTask('swig-only'), function(done) {
    const output = path.join(paths.cxxDest, `${moduleName}_wrap.cxx`);
    const input = path.join(paths.swigDest, `${moduleName}/module.i`);
    const includes = include.join(' ');
    mkdirp.sync(path.dirname(output));
    const cmd = `${swig} ${flags} ${otherFlags} ${includes} -o ${output} ${input}`;
    return run(cmd).exec(done);
  });


  gulp.task(mTask('swig'), [mTask('swig-render-deps'), mTask('swig-render')], function(done) {
    return runSequence(mTask('swig-only'), done);
  });
});
