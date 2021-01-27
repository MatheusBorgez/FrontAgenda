exports.render = () => {
    return ` <div class="modal fade" id="ExemploModalCentralizado" tabindex="-1" role="dialog" aria-labelledby="TituloModalCentralizado" aria-hidden="true">
    <div class="modal-dialog modal-dialog-centered" role="document">
    <div class="modal-content">
        <div class="modal-header">
            <h5 class="modal-title" id="TituloModalCentralizado">Adicionar Novo Aluno</h5>
            <button type="button" class="close" data-dismiss="modal" aria-label="Fechar">
        <span aria-hidden="true">&times;</span>
        </button>
        </div>
        <div class="modal-body">
            <form>
                <div class="row">
                    <div class="col-sm">
                        <label>Nome Completo</label>
                        <input class="border border-dark col-sm">
                    </div>
                </div>

                <div class="row">
                    <div class="col-sm" id="include_date">
                        <label>Data de Nascimento</label>
                        <input class="border border-dark col-sm">
                    </div>
                    <div class="col-sm">
                        <label for="cpf">CPF</label>
                        <input id="cpf" type="text" autocomplete="off" onkeyup="MaskCpf('___.___.___-__', this)" class="border border-dark">
                    </div>
                </div>
                <div class="row">
                    <div class="col-sm">
                        <label for="tel">Telefone</label>
                        <input id="tel" type="text" autocomplete="off" onkeyup="MaskTel('(__)_____-____', this)" class="border border-dark">
                    </div>
                    <div class="col-sm">
                        <label for="email">E-mail</label>
                        <input id="email" type="text" class="border border-dark">
                    </div>
                </div>
                <div class="row">
                    <div class="col-sm">
                        <label for="cep">CEP</label>
                        <input class="border border-dark" id="cep" type="text" required/>
                    </div>
                    <div class="col-sm">
                        <label for="logradouro">Logradouro</label>
                        <input class="border border-dark" id="logradouro" type="text" required/>
                    </div>
                </div>


                <div class="row">
                    <div class="col-sm">
                        <label for="numero">Número</label>
                        <input class="border border-dark" id="numero" type="text" />
                    </div>
                    <div class="col-sm">
                        <label for="complemento">Complemento</label>
                        <input class="border border-dark" id="complemento" type="text" />
                    </div>
                </div>

                <div class="row">
                    <div class="col-sm">
                        <label for="bairro">Bairro</label>
                        <input class="border border-dark" id="bairro" type="text" required/>
                    </div>
                    <div class="col-sm">
                        <label for="cidade">Cidade</label>
                        <input class="border border-dark" id="cidade" type="text" required/>
                    </div>
                </div>

                <div class="row">
                    <div class="col-sm ">

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

                    </div>
                </div>


            </form>
        </div>
        <div class="modal-footer">
            <button type="button" class="btn btn-secondary" data-dismiss="modal">Fechar</button>
            <button type="button" class="btn btn-primary">Salvar</button>
        </div>
    </div>
    </div>
</div>`
}