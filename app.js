  // ======= CONFIGURAÇÃO =======
    const LS_KEY = 'centro-explicacao-db';
    const LOGIN_USER = "admin";
    const LOGIN_PASS = "admin123";
    const PRESENCA_LIMIT_TIME = "20:00";
    const PAYMENT_DUE_DAYS = 30;
    
    // ======= ESTADO GLOBAL =======
    const state = {
      db: { students: [], attendances: [] },
      filtroKiosk: '',
      filtroAdmin: '',
      currentId: null,
      admin: { logged: false },
      currentStudent: null  // Aluno atualmente autenticado
    };

    // ======= UTILITÁRIOS =======
    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => document.querySelectorAll(sel);
    
    function todayISO() { 
      return new Date().toISOString().split('T')[0]; 
    }
    
    function nowTime() { 
      return new Date().toTimeString().split(' ')[0].slice(0,5); 
    }
    
    function formatMZN(val) { 
      return `${val.toFixed(2)} MZN`; 
    }
    
    function gerarCodigo() { 
      return Math.random().toString(36).substr(2, 6).toUpperCase(); 
    }
    
    function novoAluno() {
      return {
        id: crypto.randomUUID(),
        nome: '',
        codigo: gerarCodigo(),
        mensalidade: 0,
        notas: [],
        pagamentos: [],
        comportamento: [],
        agenda: []
      };
    }

    // ======= PERSISTÊNCIA =======
    function save() { 
      localStorage.setItem(LS_KEY, JSON.stringify(state.db)); 
    }
    
    function load() {
      const data = localStorage.getItem(LS_KEY);
      if (data) {
        try {
          state.db = JSON.parse(data);
        } catch (e) {
          console.error('Erro ao carregar dados:', e);
        }
      }
    }

    // ======= NAVEGAÇÃO ENTRE TELAS =======
    function showEntryScreen() {
      document.getElementById("entryScreen").style.display = "flex";
      document.getElementById("loginScreen").style.display = "none";
      document.querySelector(".app").style.display = "none";
      document.querySelector(".app").classList.remove("student-access");
      state.currentStudent = null;
    }

    function openAdminLogin() {
      document.getElementById("entryScreen").style.display = "none";
      document.getElementById("loginScreen").style.display = "flex";
      document.querySelector(".app").style.display = "none";
      document.querySelector(".app").classList.remove("student-access");
    }

    function openAlunoAccess() {
      document.getElementById("entryScreen").style.display = "none";
      document.getElementById("loginScreen").style.display = "none";
      document.querySelector(".app").style.display = "";
      document.querySelector(".app").classList.add("student-access");
      
      // Mostrar apenas o painel do aluno
      $$('.panel').forEach(p => p.style.display = "none");
      $('[data-panel="aluno"]').style.display = "block";
      
      // Ativar o botão correspondente
      $$('.tab-btn').forEach(b => b.classList.remove('active'));
      $('[data-tab="aluno"]').classList.add('active');
      
      // Limpar dados de aluno anterior
      state.currentStudent = null;
      $('#alunoView').style.display = 'none';
      $('#studentCode').value = '';
    }

    // Checar se está logado como admin
    function isLoggedIn() {
      return localStorage.getItem("explicacao-logged") === "yes";
    }

    function showAppOrLogin() {
      if (isLoggedIn()) {
        document.getElementById("entryScreen").style.display = "none";
        document.getElementById("loginScreen").style.display = "none";
        document.querySelector(".app").style.display = "";
        document.querySelector(".app").classList.remove("student-access");
        state.admin.logged = true;
        $('#adminLoginCard').style.display = 'none';
        $('#adminProfile').style.display = 'block';
        $('#adminArea').style.display = 'block';
        renderAdminLista();
      } else {
        showEntryScreen();
      }
    }

    // Ação do login administrativo
    document.getElementById("btnLoginEntrar").onclick = function() {
      const user = document.getElementById("usuarioLogin").value.trim();
      const pass = document.getElementById("senhaLogin").value;
      if (user === LOGIN_USER && pass === LOGIN_PASS) {
        localStorage.setItem("explicacao-logged", "yes");
        showAppOrLogin();
      } else {
        document.getElementById("loginError").style.display = "block";
      }
    };

    // Atalhos de teclado para login
    document.getElementById("usuarioLogin").addEventListener("keydown", function(e){
      if(e.key === "Enter") document.getElementById("senhaLogin").focus();
    });
    
    document.getElementById("senhaLogin").addEventListener("keydown", function(e){
      if(e.key === "Enter") document.getElementById("btnLoginEntrar").click();
    });

    // ======= NAVEGAÇÃO ENTRE PAINÉIS =======
    $$('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        // Se é acesso de aluno, não permitir navegar para outras abas
        if (document.querySelector(".app").classList.contains("student-access") && 
            btn.dataset.tab !== "aluno") {
          return;
        }
        
        const tab = btn.dataset.tab;
        
        // Atualizar botões ativos
        $$('.tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        // Mostrar painel correspondente
        $$('[data-panel]').forEach(panel => {
          panel.style.display = 'none';
        });
        $(`[data-panel="${tab}"]`).style.display = 'block';
        $(`[data-panel="${tab}"]`).classList.add('fade-in');
      });
    });

    // ======= REGISTRO AUTOMÁTICO DE FALTAS =======
    function registrarFaltasAutomaticas() {
      const hoje = todayISO();
      const horaAgora = nowTime();

      // Só executa se passou das 20h
      if (horaAgora < PRESENCA_LIMIT_TIME) return;

      state.db.students.forEach(aluno => {
        // Já tem presença hoje?
        const temPresenca = state.db.attendances.some(att => 
          att.studentId === aluno.id && att.dt === hoje && att.origem !== 'falta'
        );
        // Já tem falta hoje?
        const temFalta = state.db.attendances.some(att => 
          att.studentId === aluno.id && att.dt === hoje && att.origem === 'falta'
        );

        if (!temPresenca && !temFalta) {
          // Marca falta
          state.db.attendances.push({
            id: crypto.randomUUID(),
            studentId: aluno.id,
            dt: hoje,
            hora: PRESENCA_LIMIT_TIME,
            origem: 'falta',
            timestamp: new Date().toISOString()
          });
        }
      });

      save();
    }

    // ======= VERIFICAÇÃO DE ATRASO DE PAGAMENTOS =======
    function verificarAtrasoPagamento(aluno) {
      const prazoDias = PAYMENT_DUE_DAYS;
      const hoje = new Date();
      
      // Encontra a data do último pagamento
      const pagamentos = aluno.pagamentos;
      let ultimaData = null;
      
      if (pagamentos.length > 0) {
        // Ordena por data e pega o mais recente
        const ultimoPagamento = pagamentos.sort((a, b) => 
          new Date(b.dt) - new Date(a.dt)
        )[0];
        ultimaData = new Date(ultimoPagamento.dt);
      }
      
      // Se nunca pagou, considera desde o início do mês atual
      if (!ultimaData) {
        ultimaData = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
      }
      
      // Calcula diferença de dias
      const diffMs = hoje - ultimaData;
      const diffDias = diffMs / (1000 * 60 * 60 * 24);
      
      // Se excedeu o prazo, aumenta 20% na mensalidade
      if (diffDias > prazoDias) {
        const novaMensalidade = Math.round(aluno.mensalidade * 1.2);
        if (aluno.mensalidade !== novaMensalidade) {
          aluno.mensalidade = novaMensalidade;
          return true; // Houve aumento
        }
      }
      return false; // Não houve aumento
    }

    // ======= KIOSK =======
    function renderKiosk() {
      const lista = $('#kioskList');
      const filtro = state.filtroKiosk.toLowerCase();
      const alunos = state.db.students.filter(a => 
        a.nome.toLowerCase().includes(filtro)
      );

      if (alunos.length === 0) {
        lista.innerHTML = '<div class="text-muted" style="text-align: center; padding: 20px;">Nenhum aluno encontrado</div>';
        return;
      }

      lista.innerHTML = alunos.map(aluno => {
        const hoje = todayISO();
        const presencaHoje = state.db.attendances.find(att => 
          att.studentId === aluno.id && att.dt === hoje
        );
        
        const prox = aluno.agenda
          .filter(ag => ag.dt >= hoje)
          .sort((a,b) => (a.dt + a.hora).localeCompare(b.dt + b.hora))[0];
        
        let statusPill = '';
        if (presencaHoje) {
          statusPill = presencaHoje.origem === 'falta' 
            ? '<span class="pill danger">❌ Falta</span>' 
            : '<span class="pill success">✓ Presente</span>';
        } else if (prox && prox.dt === hoje) {
          statusPill = '<span class="pill warning">📅 Hoje</span>';
        } else if (prox) {
          statusPill = `<span class="pill warning">📅 ${prox.dt} ${prox.hora || ''}</span>`;
        }
        
        return `
          <div class="search-item" onclick="marcarPresenca('${aluno.id}')">
            <div class="inline">
              <strong>${aluno.nome}</strong>
              <div class="right">
                ${statusPill}
              </div>
            </div>
            <div class="text-muted" style="font-size: 13px; margin-top: 4px;">
              ${presencaHoje ? 'Clique para ver detalhes' : 'Clique para marcar presença'}
            </div>
          </div>
        `;
      }).join('');

      // Atualizar estatísticas
      const hoje = todayISO();
      const presencasHoje = state.db.attendances.filter(att => 
        att.dt === hoje && att.origem !== 'falta'
      ).length;
      const faltasHoje = state.db.attendances.filter(att => 
        att.dt === hoje && att.origem === 'falta'
      ).length;
      
      $('#todayStats .stat-number').textContent = `${presencasHoje} / ${presencasHoje + faltasHoje}`;
    }

    function marcarPresenca(alunoId) {
      const aluno = state.db.students.find(a => a.id === alunoId);
      if (!aluno) return;

      const hoje = todayISO();

      // Verifique se já existe presença para este aluno hoje
      const jaMarcou = state.db.attendances.some(att => 
        att.studentId === alunoId && att.dt === hoje && att.origem !== 'falta'
      );
      
      if (jaMarcou) {
        alert(`❌ Presença já marcada hoje para ${aluno.nome}`);
        return;
      }

      // Remove falta se existir (quando o aluno chega depois das 20h)
      state.db.attendances = state.db.attendances.filter(att => 
        !(att.studentId === alunoId && att.dt === hoje && att.origem === 'falta')
      );

      const agora = new Date();
      const presenca = {
        id: crypto.randomUUID(),
        studentId: alunoId,
        dt: hoje,
        hora: nowTime(),
        origem: 'kiosk',
        timestamp: agora.toISOString()
      };

      state.db.attendances.push(presenca);
      save();
      renderKiosk();

      // Feedback visual
      const item = event.target.closest('.search-item');
      item.style.background = 'var(--success-light)';
      item.style.borderColor = 'var(--success)';
      setTimeout(() => {
        item.style.background = '';
        item.style.borderColor = '';
      }, 1000);

      alert(`✅ Presença marcada para ${aluno.nome}`);
    }

    $('#kioskSearch').addEventListener('input', (e) => {
      state.filtroKiosk = e.target.value;
      renderKiosk();
    });

    $('#kioskClear').addEventListener('click', () => {
      $('#kioskSearch').value = '';
      state.filtroKiosk = '';
      renderKiosk();
    });

    // ======= PORTAL DO ALUNO =======
    $('#btnAlunoLogin').addEventListener('click', () => {
      const codigo = $('#studentCode').value.trim().toUpperCase();
      const aluno = state.db.students.find(a => a.codigo === codigo);
      
      if (!aluno) {
        alert('Código inválido');
        return;
      }

      state.currentStudent = aluno;
      mostrarDadosAluno(aluno);
    });

    function logoutAluno() {
      state.currentStudent = null;
      $('#alunoView').style.display = 'none';
      $('#studentCode').value = '';
      alert('Sessão terminada. Para aceder novamente, insira o seu código.');
    }

    function mostrarDadosAluno(aluno) {
      $('#alunoView').style.display = 'block';
      $('#alunoNome').textContent = aluno.nome;
      $('#alunoCodigo').textContent = aluno.codigo;

      // Verifica atraso no pagamento
      const teveAumento = verificarAtrasoPagamento(aluno);
      if (teveAumento) {
        save();
      }

      // Calcular saldo
      const totalPago = aluno.pagamentos.reduce((sum, p) => sum + p.valor, 0);
      const saldo = totalPago - (aluno.mensalidade || 0);
      $('#alunoSaldo').innerHTML = saldo >= 0 ? 
        `<span class="pill success">${formatMZN(saldo)}</span>` : 
        `<span class="pill danger">${formatMZN(saldo)}</span>`;

      // Mostrar mensagem de alerta se houver atraso
      if (teveAumento) {
        $('#alunoSaldo').innerHTML += ` <span class="pill warning">+20% (Atraso)</span>`;
      }

      // Próximas aulas
      const prox = aluno.agenda
        .filter(ag => ag.dt >= todayISO())
        .sort((a,b) => (a.dt + a.hora).localeCompare(b.dt + b.hora))[0];
      $('#alunoProx').textContent = prox ? `${prox.dt} ${prox.hora || ''}` : 'Nenhuma';

      // Presenças
      const presencas = state.db.attendances
        .filter(att => att.studentId === aluno.id)
        .sort((a,b) => b.timestamp.localeCompare(a.timestamp));
      
      $('#alunoPresencas tbody').innerHTML = presencas.length ? 
        presencas.map(p => `
          <tr>
            <td>${p.dt}</td>
            <td>${p.hora}</td>
            <td>${
              p.origem === 'falta' 
                ? '<span class="pill danger">Falta</span>' 
                : '<span class="pill success">Presente</span>'
            }</td>
          </tr>
        `).join('') : 
        '<tr><td colspan="3" class="text-muted">Nenhuma presença registada</td></tr>';

      // Notas
      $('#alunoNotas tbody').innerHTML = aluno.notas.length ?
        aluno.notas.map(n => `
          <tr>
            <td>${n.disc}</td>
            <td>${n.periodo}</td>
            <td><strong>${n.nota}</strong></td>
          </tr>
        `).join('') :
        '<tr><td colspan="3" class="text-muted">Nenhuma nota registada</td></tr>';

      // Pagamentos
      $('#alunoPagamentos tbody').innerHTML = aluno.pagamentos.length ?
        aluno.pagamentos.sort((a,b) => new Date(b.dt) - new Date(a.dt)).map(p => `
          <tr>
            <td>${p.dt}</td>
            <td>${formatMZN(p.valor)}</td>
            <td>${p.metodo || '—'}</td>
          </tr>
        `).join('') :
        '<tr><td colspan="3" class="text-muted">Nenhum pagamento registado</td></tr>';

      // Comportamento
      $('#alunoComport tbody').innerHTML = aluno.comportamento.length ?
        aluno.comportamento.sort((a,b) => new Date(b.dt) - new Date(a.dt)).map(c => `
          <tr>
            <td>${c.dt}</td>
            <td><span class="pill ${c.nivel === 'Excelente' ? 'success' : c.nivel === 'Bom' ? 'success' : c.nivel === 'Regular' ? 'warning' : 'danger'}">${c.nivel}</span></td>
            <td>${c.obs || '—'}</td>
          </tr>
        `).join('') :
        '<tr><td colspan="3" class="text-muted">Nenhuma observação registada</td></tr>';
    }

    // ======= ADMINISTRAÇÃO =======
    $('#btnAdminLogin').addEventListener('click', () => {
      const pass = $('#adminPass').value.trim();
      
      if (pass !== LOGIN_PASS) {
        alert('Palavra-passe incorreta');
        return;
      }
      
      state.admin.logged = true;
      localStorage.setItem("explicacao-logged", "yes");
      $('#adminLoginCard').style.display = 'none';
      $('#adminProfile').style.display = 'block';
      $('#adminArea').style.display = 'block';
      renderAdminLista();
    });

    function logoutAdmin() {
      state.admin.logged = false;
      localStorage.removeItem("explicacao-logged");
      $('#adminProfile').style.display = 'none';
      $('#adminArea').style.display = 'none';
      $('#adminLoginCard').style.display = 'block';
      $('#adminEditor').style.display = 'none';
      showEntryScreen();
    }

    function renderAdminLista() {
      const lista = $('#adminListaAlunos');
      const filtro = state.filtroAdmin.toLowerCase();
      const alunos = state.db.students.filter(a => 
        a.nome.toLowerCase().includes(filtro)
      );

      if (alunos.length === 0) {
        lista.innerHTML = '<div class="text-muted" style="text-align: center; padding: 20px;">Nenhum aluno encontrado</div>';
        return;
      }

      lista.innerHTML = `
        <div class="table-container">
          <table>
            <thead>
              <tr>
                <th>Nome</th>
                <th>Código</th>
                <th>Mensalidade</th>
                <th>Saldo</th>
                <th>Próxima Aula</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              ${alunos.map(a => {
                // Verifica atraso no pagamento
                verificarAtrasoPagamento(a);
                
                const totalPago = a.pagamentos.reduce((sum, p) => sum + p.valor, 0);
                const saldo = totalPago - (a.mensalidade || 0);
                const prox = a.agenda
                  .filter(ag => ag.dt >= todayISO())
                  .sort((a,b) => (a.dt + a.hora).localeCompare(b.dt + b.hora))[0];
                
                return `
                  <tr>
                    <td><strong>${a.nome}</strong></td>
                    <td><span class="code">${a.codigo}</span></td>
                    <td>${formatMZN(a.mensalidade || 0)}</td>
                    <td>${saldo >= 0 ? 
                      `<span class="pill success">${formatMZN(saldo)}</span>` : 
                      `<span class="pill danger">${formatMZN(saldo)}</span>`
                    }</td>
                    <td>${prox ? `${prox.dt} ${prox.hora || ''}` : '—'}</td>
                    <td><button class="btn" onclick="carregarAlunoEditor('${a.id}')">Editar</button></td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      `;
    }

    $('#adminSearch').addEventListener('input', (e) => {
      state.filtroAdmin = e.target.value;
      renderAdminLista();
    });

    $('#btnNovoAluno').addEventListener('click', () => {
      abrirEditor(novoAluno());
    });

    function abrirEditor(aluno) {
      state.currentId = aluno.id;
      $('#adminEditor').style.display = 'block';
      $('#edTitulo').textContent = aluno.nome || 'Novo Aluno';
      $('#edCodigo').textContent = aluno.codigo;
      $('#edNome').value = aluno.nome || '';
      $('#edMensalidade').value = aluno.mensalidade || 0;
      $('#edCodigoInput').value = aluno.codigo;
      renderEdTables(aluno);
    }

    function carregarAlunoEditor(id) {
      const aluno = state.db.students.find(a => a.id === id);
      if (aluno) abrirEditor(aluno);
    }

    function renderEdTables(aluno) {
      // Notas
      $('#edNotas tbody').innerHTML = aluno.notas.length ?
        aluno.notas.map((n, i) => `
          <tr>
            <td>${n.disc}</td>
            <td>${n.periodo}</td>
            <td><strong>${n.nota}</strong></td>
            <td><button class="btn danger" onclick="delNota(${i})">Remover</button></td>
          </tr>
        `).join('') :
        '<tr><td colspan="4" class="text-muted">Sem notas</td></tr>';

      // Pagamentos
      $('#edPagamentos tbody').innerHTML = aluno.pagamentos.length ?
        aluno.pagamentos.map((p, i) => `
          <tr>
            <td>${p.dt}</td>
            <td>${formatMZN(p.valor)}</td>
            <td>${p.metodo || ''}</td>
            <td>${p.ref || ''}</td>
            <td><button class="btn danger" onclick="delPagamento(${i})">Remover</button></td>
          </tr>
        `).join('') :
        '<tr><td colspan="5" class="text-muted">Sem pagamentos</td></tr>';

      // Comportamento
      $('#edComport tbody').innerHTML = aluno.comportamento.length ?
        aluno.comportamento.map((c, i) => `
          <tr>
            <td>${c.dt}</td>
            <td><span class="pill ${c.nivel === 'Excelente' ? 'success' : c.nivel === 'Bom' ? 'success' : c.nivel === 'Regular' ? 'warning' : 'danger'}">${c.nivel}</span></td>
            <td>${c.obs || ''}</td>
            <td><button class="btn danger" onclick="delComport(${i})">Remover</button></td>
          </tr>
        `).join('') :
        '<tr><td colspan="4" class="text-muted">Sem observações</td></tr>';

      // Agenda
      $('#edAgenda tbody').innerHTML = aluno.agenda.length ?
        aluno.agenda.sort((a, b) => (a.dt + a.hora).localeCompare(b.dt + b.hora)).map((a, i) => `
          <tr>
            <td>${a.dt}</td>
            <td>${a.hora || ''}</td>
            <td><button class="btn danger" onclick="delAgendamento(${i})">Remover</button></td>
          </tr>
        `).join('') :
        '<tr><td colspan="3" class="text-muted">Sem agendamentos</td></tr>';
    }

    // Editor: ações específicas
    function getAlunoAtual() {
      return state.db.students.find(a => a.id === state.currentId);
    }

    function guardarAluno() {
      let aluno = getAlunoAtual();
      if (!aluno) {
        aluno = novoAluno();
        state.currentId = aluno.id;
        state.db.students.push(aluno);
      }
      
      aluno.nome = $('#edNome').value.trim();
      aluno.mensalidade = Number($('#edMensalidade').value || 0);
      aluno.codigo = $('#edCodigoInput').value.trim().toUpperCase() || gerarCodigo();
      
      save();
      renderAdminLista();
      abrirEditor(aluno);
      alert('✅ Dados guardados com sucesso');
    }

    function apagarAluno() {
      const aluno = getAlunoAtual();
      if (!aluno) return;
      
      if (!confirm('Tem a certeza que deseja apagar este aluno? Esta ação é irreversível.')) return;
      
      state.db.students = state.db.students.filter(a => a.id !== aluno.id);
      // Também remover as presenças associadas
      state.db.attendances = state.db.attendances.filter(att => att.studentId !== aluno.id);
      save();
      $('#adminEditor').style.display = 'none';
      renderAdminLista();
      alert('✅ Aluno removido');
    }

    function randomCode(inputId) {
      document.getElementById(inputId).value = gerarCodigo();
    }

    // Notas
    function addNota() {
      const aluno = getAlunoAtual();
      if (!aluno) return;
      
      const disc = $('#notaDisc').value.trim();
      const per = $('#notaPer').value.trim();
      const val = $('#notaVal').value.trim();
      
      if (!disc || !per || !val) {
        alert('Preencha todos os campos');
        return;
      }
      
      aluno.notas.push({ disc, periodo: per, nota: Number(val) });
      save();
      renderEdTables(aluno);
      $('#notaDisc').value = '';
      $('#notaPer').value = '';
      $('#notaVal').value = '';
    }

    function delNota(i) {
      const a = getAlunoAtual();
      a.notas.splice(i, 1);
      save();
      renderEdTables(a);
    }

    // Pagamentos
    function addPagamento() {
      const a = getAlunoAtual();
      if (!a) return;
      
      const v = Number($('#pagVal').value || 0);
      if (!v) {
        alert('Valor inválido');
        return;
      }
      
      const m = $('#pagMetodo').value.trim();
      const r = $('#pagRef').value.trim();
      
      a.pagamentos.push({
        dt: todayISO(),
        valor: v,
        metodo: m,
        ref: r
      });
      
      save();
      renderEdTables(a);
      $('#pagVal').value = '';
      $('#pagMetodo').value = '';
      $('#pagRef').value = '';
    }

    function delPagamento(i) {
      const a = getAlunoAtual();
      a.pagamentos.splice(i, 1);
      save();
      renderEdTables(a);
    }

    // Comportamento
    function addComport() {
      const a = getAlunoAtual();
      if (!a) return;
      
      const n = $('#compNivel').value;
      const obs = $('#compObs').value.trim();
      
      a.comportamento.push({
        dt: todayISO(),
        nivel: n,
        obs: obs
      });
      
      save();
      renderEdTables(a);
      $('#compObs').value = '';
    }

    function delComport(i) {
      const a = getAlunoAtual();
      a.comportamento.splice(i, 1);
      save();
      renderEdTables(a);
    }

    // Agendamento
    function addAgendamento() {
      const a = getAlunoAtual();
      if (!a) return;
      
      const dt = $('#agData').value;
      const hr = $('#agHora').value;
      
      if (!dt) {
        alert('Escolha a data');
        return;
      }
      
      a.agenda.push({ dt, hora: hr });
      save();
      renderEdTables(a);
      $('#agData').value = '';
      $('#agHora').value = '';
    }

    function delAgendamento(i) {
      const a = getAlunoAtual();
      a.agenda.splice(i, 1);
      save();
      renderEdTables(a);
    }

    // ======= EXPORT / IMPORT =======
    function exportJSON() {
      const data = JSON.stringify(state.db, null, 2);
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `centro-explicacao-backup-${todayISO()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    }

    $('#importFile').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      
      if (!confirm('Tem a certeza que deseja importar dados? Todos os dados atuais serão substituídos.')) {
        e.target.value = '';
        return;
      }
      
      try {
        const text = await file.text();
        const json = JSON.parse(text);
        
        if (!json.students || !json.attendances) {
          throw new Error('Formato de arquivo inválido');
        }
        
        state.db = json;
        save();
        renderKiosk();
        if (state.admin.logged) renderAdminLista();
        alert('✅ Dados importados com sucesso');
      } catch (err) {
        alert('❌ Falha na importação: ' + err.message);
      }
      
      e.target.value = '';
    });

    function exportPDF() {
      // Pegue os dados dos alunos
      const alunos = state.db.students;

      // Crie o documento PDF
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF();

      doc.setFont("helvetica");
      doc.setFontSize(16);
      doc.text("Relatório de Alunos - Explicação MD", 10, 15);
      doc.setFontSize(10);
      doc.text(`Data do relatório: ${new Date().toLocaleDateString('pt-PT')}`, 10, 22);

      let y = 30;
      alunos.forEach((aluno, idx) => {
        // Verificar se precisa de nova página
        if (y > 270) {
          doc.addPage();
          y = 20;
        }
        
        doc.setFontSize(12);
        doc.setTextColor(41, 128, 185);
        doc.text(`${idx + 1}. ${aluno.nome} (${aluno.codigo})`, 10, y);
        y += 7;
        
        doc.setFontSize(10);
        doc.setTextColor(0, 0, 0);
        doc.text(`Mensalidade: ${formatMZN(aluno.mensalidade)}`, 10, y);
        y += 5;

        // Calcular saldo
        const totalPago = aluno.pagamentos.reduce((sum, p) => sum + p.valor, 0);
        const saldo = totalPago - aluno.mensalidade;
        doc.text(`Saldo: ${formatMZN(saldo)}`, 10, y);
        y += 7;

        // Notas
        if (aluno.notas.length) {
          doc.setTextColor(128, 128, 128);
          doc.text("Notas:", 10, y);
          y += 5;
          doc.setTextColor(0, 0, 0);
          
          aluno.notas.forEach(nota => {
            if (y > 270) {
              doc.addPage();
              y = 20;
            }
            doc.text(`- ${nota.disc}: ${nota.nota} (${nota.periodo})`, 12, y);
            y += 5;
          });
          y += 2;
        }

        // Próximas aulas
        const proximasAulas = aluno.agenda.filter(ag => ag.dt >= todayISO())
          .sort((a,b) => (a.dt + a.hora).localeCompare(b.dt + b.hora));
        
        if (proximasAulas.length) {
          doc.setTextColor(128, 128, 128);
          doc.text("Próximas aulas:", 10, y);
          y += 5;
          doc.setTextColor(0, 0, 0);
          
          proximasAulas.slice(0, 3).forEach(aula => {
            if (y > 270) {
              doc.addPage();
              y = 20;
            }
            const dataFormatada = new Date(aula.dt).toLocaleDateString('pt-PT');
            doc.text(`- ${dataFormatada} ${aula.hora || ''}`, 12, y);
            y += 5;
          });
          y += 2;
        }

        y += 5;
        // Linha separadora
        doc.line(10, y, 200, y);
        y += 8;
      });

      // Baixa o PDF
      doc.save(`explicacao-relatorio-${todayISO()}.pdf`);
    }

    // ======= DEMO =======

    // ======= INICIALIZAÇÃO =======
    function init() {
      load();
      
      // Registrar faltas automaticamente se for após das 20h
      registrarFaltasAutomaticas();
      
      // Verificar login e mostrar interface apropriada
      showAppOrLogin();
      
      // Renderizar interface
      renderKiosk();
      
      // Definir data padrão para agendamentos
      $('#agData').value = todayISO();
      
      // Adicionar listeners para atalhos de teclado
      $('#studentCode').addEventListener('keydown', e => {
        if (e.key === 'Enter') $('#btnAlunoLogin').click();
      });
      
      $('#adminPass').addEventListener('keydown', e => {
        if (e.key === 'Enter') $('#btnAdminLogin').click();
      });
    }

    // Iniciar a aplicação quando o documento estiver carregado

    document.addEventListener('DOMContentLoaded', init);
