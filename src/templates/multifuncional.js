const GridMarcacao = require('./gridMarcacao.js');

exports.render = () => {
    return `
    <div class="container ">
    <div class="img-fluid text-right mr-5 mt-5 text-white botaoShutdown" botaoShutdown>
    <a href="#"><img src="./images/shutdown.png" alt=""></a>
    <strong class="mr-1">Sair</strong>
</div>
    <div>
        <span class="login100-form-title p-b-43 p-2">
            Sala Multifuncional                    
        </span>
    </div>
</div>

${GridMarcacao.render()}

`;
}