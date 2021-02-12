const ModalCadastroAluno = require("./cadastroAluno.js");

const renderGridAlunos = alunos => {
    return alunos.map(aluno => {

        let corLinha = aluno.id % 2 === 0 ? "back-gridrow1" : "back-gridrow2";

        return `
        <div class="row ${corLinha} text-dark">            
            <div class="col-sm">
                <div class="form-group form-check">
                    <input type="checkbox" class="form-check-input mt-4" alunoSelecionado codigoAluno=${aluno.id}>
                </div>
                <label class="text-center mb-2">${aluno.nome}</label>
            </div>
        
            <div class="col-sm ">
                <label class="text-center mt-3">${aluno.cpf}</label>
            </div>
        
            <div class="col-sm ">
                <label class="text-center mt-3">${aluno.matricula}</label>
            </div>        
        </div>`
    }).join("");
}

exports.render = alunos => {

    return `

    <div class="img-fluid text-right mr-5 mt-5 text-white botaoShutdown" botaoShutdown>
        <a href="#"><img src="./images/shutdown.png" alt=""></a>
        <strong class="mr-1">Sair</strong>
    </div>
    
    <div class="container">
        <div>
            <span class="login100-form-title p-b-43 p-2 mt-2">
                Área Administrativa
            </span>
        </div>
    </div>

    <div class="container">
    <div class="row ">
                <div class="col-sm">
                    <div id="divBusca" class="busca">
                    <input type="search" id="txtBusca" placeholder="Buscar..." />                    
                        <a class="" href="#">
                            <img src="./images/pesquisa.png" id="btnBusca" alt="Buscar" />
                        </a>
                    </div>
                </div>
            </div>            

            <div class="container mt-1">

                <div class="row  border border-white back-grid text-white">
                    <div class="col-sm text-center">
                        Nome
                    </div>

                    <div class="col-sm text-center">
                        CPF
                    </div>

                    <div class="col-sm text-center">
                        Matrícula
                    </div>
                </div>


            ${renderGridAlunos(alunos)}

            </div>

        <div class="container col-sm mt-3">
            <div class="row">
                <div class="centered">
                                
                    <button type="button" class="btn btn-primary btn-dark" data-toggle="modal" data-target="#modalCadastroAluno" botaoAdicionar>
                        Adicionar
                    </button>

                    <button type="button" class="btn btn-dark" botaoEditar>
                        Editar
                    </button>

                    <button type="button" class="btn btn-dark" botaoExcluir>
                        Excluir
                    </button>

                    ${ModalCadastroAluno.render()}
                    
                </div>
            </div>
        </div>
    </div>    
    `;
}