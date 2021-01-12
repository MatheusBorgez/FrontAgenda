exports.render = () => {
    return `<div class="limiter">
    <div class="container-login100">
        <div class="wrap-login100 p-b-160 p-t-50">
            <main></main>
            <footer></footer>
            <form class="login100-form">
                <span class="login100-form-title p-b-43">
                    Acesso da Conta
                </span>

                <div class="wrap-input100 rs1 validate-input" data-validate="Campo obrigatório">
                    <input class="input100" type="text" name="username">
                    <span class="label-input100">Usuário</span>
                </div>


                <div class="wrap-input100 rs2 validate-input" data-validate="Campo obrigatório">
                    <input class="input100" type="password" name="pass">
                    <span class="label-input100">Senha</span>
                </div>

                <div class="container-login100-form-btn">
                    <button class="login100-form-btn" href="menu.html">
                        Entrar
                    </button>
                </div>

                <div class="text-center w-full p-t-23">
                    <a href="#" class="txt1">
                        Esqueceu a Senha? Entre em Contato Conosco.
                    </a>
                </div>
            </form>
        </div>
    </div>
</div>`
}