module.render = () => {
    return `<div>
    <div class="container ">
        <div>
            <span class="login100-form-title p-b-43 p-2 mt-2">
                Área Administrativa
            </span>
        </div>
    </div>

    <div class="container mt-5 border border-white back-grid text-white">
        <div class="row">
            <div class="col-sm">
                Nome
            </div>
            <div class="col-sm">
                CPF
            </div>
            <div class="col-sm">
                Matrícula
            </div>
        </div>
        <div class="row back-gridrow1 text-dark">
            <div class="col-sm">
                José da Costa
            </div>
            <div class="col-sm">
                03597468321
            </div>
            <div class="col-sm">
                12365879463521
            </div>
        </div>
    </div>

    <div class="container col-sm mt-3">
        <div class="row">

            <div class="centered">
                <!-- Botão para chamar modal_include -->
                <button type="button" class="btn btn-primary btn-dark" data-toggle="modal"
                    data-target="#ExemploModalCentralizado">
                    Adicionar
                </button>
                <!-- modal_include -->
                <div class="modal fade" id="ExemploModalCentralizado" tabindex="-1" role="dialog"
                    aria-labelledby="TituloModalCentralizado" aria-hidden="true">
                    <div class="modal-dialog modal-dialog-centered" role="document">
                        <div class="modal-content">
                            <div class="modal-header">
                                <h5 class="modal-title" id="TituloModalCentralizado">Adicionar Novo Aluno</h5>
                                <button type="button" class="close" data-dismiss="modal" aria-label="Fechar">
                                    <span aria-hidden="true">&times;</span>
                                </button>
                            </div>
                            <div class="modal-body">

                                <div class="row">
                                    <div class="col-sm" id="include_name">
                                        <label>Nome Completo</label>
                                        <input class="border border-dark col-sm">
                                    </div>
                                </div>

                                <div class="row">
                                    <div class="col-sm" id="include_date">
                                        <label>Data de Nascimento</label>
                                        <input class="border border-dark col-sm">
                                    </div>
                                    <div class="col-sm" id="include_cpf">
                                        <form method="post"></form>
                                        <label>CPF</label>
                                        <input type="text" id="cpf">
                                        </form>
                                    </div>
                                </div>

                                <div class="row">
                                    <div class="col-sm " id="include_address">
                                        <form>
                                            <label for="cep">CEP</label>
                                            <input class="border border-dark" id="cep" type="text" required />
                                            <label for="logradouro">Logradouro</label>
                                            <input class="border border-dark" id="logradouro" type="text"
                                                required />
                                            <label for="numero">Número</label>
                                            <input class="border border-dark" id="numero" type="text" />
                                            <label for="complemento">Complemento</label>
                                            <input class="border border-dark" id="complemento" type="text" />
                                            <label for="bairro">Bairro</label>
                                            <input class="border border-dark" id="bairro" type="text" required />
                                            <label for="cidade">Cidade</label>
                                            <input class="border border-dark" id="cidade" type="text" required />
                                            <label for="uf">Estado</label>
                                            <select id="uf">
                                                <option value="AC">Acre</option>
                                                <option value="AL">Alagoas</option>
                                                <option value="AP">Amapá</option>
                                                <option value="AM">Amazonas</option>
                                                <option value="BA">Bahia</option>
                                                <option value="CE">Ceará</option>
                                                <option value="DF">Distrito Federal</option>
                                                <option value="ES">Espírito Santo</option>
                                                <option value="GO">Goiás</option>
                                                <option value="MA">Maranhão</option>
                                                <option value="MT">Mato Grosso</option>
                                                <option value="MS">Mato Grosso do Sul</option>
                                                <option value="MG">Minas Gerais</option>
                                                <option value="PA">Pará</option>
                                                <option value="PB">Paraíba</option>
                                                <option value="PR">Paraná</option>
                                                <option value="PE">Pernambuco</option>
                                                <option value="PI">Piauí</option>
                                                <option value="RJ">Rio de Janeiro</option>
                                                <option value="RN">Rio Grande do Norte</option>
                                                <option value="RS">Rio Grande do Sul</option>
                                                <option value="RO">Rondônia</option>
                                                <option value="RR">Roraima</option>
                                                <option value="SC">Santa Catarina</option>
                                                <option value="SP">São Paulo</option>
                                                <option value="SE">Sergipe</option>
                                                <option value="TO">Tocantins</option>
                                            </select>
                                        </form>
                                    </div>
                                </div>



                            </div>
                            <div class="modal-footer">
                                <button type="button" class="btn btn-secondary" data-dismiss="modal">Fechar</button>
                                <button type="button" class="btn btn-primary">Salvar</button>
                            </div>
                        </div>
                    </div>
                </div>

                <button type="button" class="btn btn-dark">Editar</button>
                <button type="button" class="btn btn-dark">Excluir</button>
            </div>



        </div>

    </div>
</div>`;
}