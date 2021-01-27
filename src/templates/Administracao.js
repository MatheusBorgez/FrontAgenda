exports.render = () => {
    return `<div class="img-fluid text-right botaoShutdown mr-5 mt-5" botaoShutdown>
    <a href="#"><img src="./images/shutdown.png" alt=""></a>
    <strong class="mr-1">Sair</strong>
</div>
    <div class="container ">
    <div>
        <span class="login100-form-title p-b-43 p-2 mt-2">
            Área Administrativa
        </span>
    </div>
</div>

<div class="container ">

            <div class="row ">
                <div class="col-sm">
                    <div id="divBusca" class="busca">
                        <input type="text" id="txtBusca" placeholder="Buscar..." />
                        <a class="" href="#">
                            <img src="./images/pesquisa.png" id="btnBusca" alt="Buscar" />
                        </a>
                    </div>
                </div>
            </div>

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

            <div class="row back-gridrow1 text-dark">
                <div class="col-sm">
                    <div class="form-group form-check">
                        <input type="checkbox" class="form-check-input mt-4" id="exampleCheck1">
                    </div>
                    <label class="text-center mb-2">Nome do Aluno</label>
                </div>

                <div class="col-sm ">
                    <label class="text-center mt-3">___.___.___-__</label>
                </div>

                <div class="col-sm ">
                    <label class="text-center mt-3">202101151247</label>
                </div>

            </div>

            <div class="row back-gridrow2 text-dark">
                <div class="col-sm">
                    <div class="form-group form-check">
                        <input type="checkbox" class="form-check-input mt-4" id="exampleCheck1">
                    </div>
                    <label class="text-center mb-2">Nome do Aluno</label>
                </div>

                <div class="col-sm ">
                    <label class="text-center mt-3">___.___.___-__</label>
                </div>

                <div class="col-sm ">
                    <label class="text-center mt-3">202101151247</label>
                </div>

            </div>

            <div class="container col-sm mt-3">
                <div class="row">
                    <div class="centered">
                        
                        <button type="button" class="btn btn-primary btn-dark" botaoAdicionar>
                            Adicionar
                        </button>
                
                        <button type="button" class="btn btn-dark" botaoEditar>
                            Editar
                        </button>
                
                        <button type="button" class="btn btn-dark" botaoExcluir>
                            Excluir
                        </button>

                    </div>
                </div>
            </div>
</div>`
}