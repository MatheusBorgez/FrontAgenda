const GridMarcacao = require('./gridMarcacao.js');

exports.render = horarios => {
    return `
    <div class="container ">
    <div>
        <span class="login100-form-title p-b-43 p-2">
            Sala Musculacao                    
        </span>
    </div>
</div>

${GridMarcacao.render(horarios)}

`;
}