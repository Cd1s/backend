const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const ts = require('typescript');

const repositoryRoot = path.resolve(__dirname, '..');
const aliases = new Map([
    ['@common', 'src/common'],
    ['@integration-modules', 'src/integration-modules'],
    ['@modules', 'src/modules'],
    ['@libs/contracts', 'libs/contract'],
    ['@libs/subscription-page', 'libs/subscription-page'],
    ['@contract', 'libs/contract'],
    ['@queue', 'src/queue'],
    ['@scheduler', 'src/scheduler'],
]);

const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function resolveFilename(request, parent, isMain, options) {
    for (const [alias, target] of aliases) {
        if (request === alias || request.startsWith(`${alias}/`)) {
            const suffix = request.slice(alias.length).replace(/^\//, '');
            request = path.join(repositoryRoot, target, suffix);
            break;
        }
    }

    return originalResolveFilename.call(this, request, parent, isMain, options);
};

Module._extensions['.ts'] = function compileTypeScript(module, filename) {
    const source = fs.readFileSync(filename, 'utf8');
    const { outputText } = ts.transpileModule(source, {
        fileName: filename,
        compilerOptions: {
            baseUrl: repositoryRoot,
            esModuleInterop: true,
            experimentalDecorators: true,
            emitDecoratorMetadata: true,
            module: ts.ModuleKind.CommonJS,
            moduleResolution: ts.ModuleResolutionKind.Node10,
            target: ts.ScriptTarget.ES2022,
            useDefineForClassFields: true,
        },
    });

    module._compile(outputText, filename);
};
