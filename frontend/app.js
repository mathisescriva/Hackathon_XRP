// Configuration
const API_BASE_URL = 'http://localhost:3000';

// S'assurer que les fonctions sont accessibles globalement
window.loadEmployerShifts = loadEmployerShifts;
window.validateShift = validateShift;
window.refuseShift = refuseShift;
window.releasePayment = releasePayment;
window.showEmployerTab = showEmployerTab;
window.refreshEmployerShifts = refreshEmployerShifts;

// État global
let currentUser = null;
let currentToken = null;
let mediaRecorder = null;
let audioChunks = { start: [], end: [] };
let currentRecording = null;
let transcriptions = { start: null, end: null }; // Stocker les transcriptions

// Initialisation
document.addEventListener('DOMContentLoaded', () => {
    // Vérifier si on a un token stocké
    const savedToken = localStorage.getItem('token');
    const savedUser = localStorage.getItem('user');
    
    if (savedToken && savedUser) {
        currentToken = savedToken;
        currentUser = JSON.parse(savedUser);
        showUserDashboard();
    }
    
    // Charger les employeurs si on est worker
    if (currentUser?.role === 'worker') {
        loadEmployers();
    }
    
    // Pré-remplir l'adresse XRPL si un wallet est connecté
    const xrplAddress = localStorage.getItem('xrpl_wallet_address');
    if (xrplAddress) {
        const registerXrplInput = document.getElementById('registerXrpl');
        if (registerXrplInput) {
            registerXrplInput.value = xrplAddress;
            registerXrplInput.placeholder = `Adresse XRPL: ${xrplAddress.substring(0, 10)}...`;
            registerXrplInput.readOnly = true;
            registerXrplInput.style.background = '#f0f0f0';
        }
    }
    
    // Écouter les changements de wallet (si la page wallet est ouverte dans un autre onglet)
    window.addEventListener('storage', (e) => {
        if (e.key === 'xrpl_wallet_address') {
            const newAddress = e.newValue;
            const registerXrplInput = document.getElementById('registerXrpl');
            if (registerXrplInput && newAddress) {
                registerXrplInput.value = newAddress;
                registerXrplInput.placeholder = `Adresse XRPL: ${newAddress.substring(0, 10)}...`;
            }
        }
    });
});

// Auth functions
function showTab(tabName) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    
    event.target.classList.add('active');
    document.getElementById(tabName + 'Tab').classList.add('active');
}

async function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;

    try {
        const response = await fetch(`${API_BASE_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Erreur de connexion');
        }

        currentToken = data.token;
        currentUser = data.user;
        
        localStorage.setItem('token', data.token);
        localStorage.setItem('user', JSON.stringify(data.user));

        showMessage('Connexion réussie !', 'success');
        showUserDashboard();
    } catch (error) {
        showMessage('Erreur: ' + error.message, 'error');
    }
}

async function handleRegister(e) {
    e.preventDefault();
    const name = document.getElementById('registerName').value;
    const email = document.getElementById('registerEmail').value;
    const password = document.getElementById('registerPassword').value;
    const role = document.getElementById('registerRole').value;
    const xrpl_address = document.getElementById('registerXrpl').value || undefined;

    try {
        const response = await fetch(`${API_BASE_URL}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, email, password, role, xrpl_address })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Erreur d\'inscription');
        }

        currentToken = data.token;
        currentUser = data.user;
        
        localStorage.setItem('token', data.token);
        localStorage.setItem('user', JSON.stringify(data.user));

        showMessage('Inscription réussie !', 'success');
        showUserDashboard();
    } catch (error) {
        showMessage('Erreur: ' + error.message, 'error');
    }
}

function logout() {
    currentToken = null;
    currentUser = null;
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    
    document.getElementById('authSection').style.display = 'block';
    document.getElementById('workerSection').style.display = 'none';
    document.getElementById('employerSection').style.display = 'none';
    document.getElementById('userInfo').style.display = 'none';
}

function showUserDashboard() {
    document.getElementById('authSection').style.display = 'none';
    document.getElementById('userInfo').style.display = 'flex';
    document.getElementById('userName').textContent = currentUser.name;
    document.getElementById('userRole').textContent = currentUser.role;

    if (currentUser.role === 'worker') {
        document.getElementById('workerSection').style.display = 'block';
        document.getElementById('employerSection').style.display = 'none';
        loadEmployers();
        loadWorkerShifts();
    } else if (currentUser.role === 'employer') {
        document.getElementById('workerSection').style.display = 'none';
        document.getElementById('employerSection').style.display = 'block';
        // Initialiser l'onglet "À valider" et charger les shifts
        setTimeout(() => {
            showEmployerTab('proposed');
        }, 100);
    }
}

// Audio recording
let currentStream = null; // Stocker le stream pour pouvoir l'arrêter

async function startRecording(type) {
    try {
        console.log('🎤 Démarrage enregistrement:', type);
        
        // Arrêter l'enregistrement précédent s'il y en a un
        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
            console.log('⚠️ Arrêt de l\'enregistrement précédent');
            mediaRecorder.stop();
        }
        
        // Arrêter le stream précédent s'il existe
        if (currentStream) {
            currentStream.getTracks().forEach(track => track.stop());
        }
        
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        currentStream = stream;
        mediaRecorder = new MediaRecorder(stream);
        audioChunks[type] = [];
        currentRecording = type;

        console.log('✅ Microphone activé, MediaRecorder créé');

        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                audioChunks[type].push(event.data);
                console.log('📦 Chunk audio reçu:', event.data.size, 'bytes');
            }
        };

        mediaRecorder.onstop = async () => {
            console.log('⏹️ Enregistrement arrêté');
            const audioBlob = new Blob(audioChunks[type], { type: 'audio/webm' });
            console.log('🎵 Audio blob créé:', {
                size: audioBlob.size,
                type: audioBlob.type,
                chunks: audioChunks[type].length
            });
            
            const audioUrl = URL.createObjectURL(audioBlob);
            const audioElement = document.getElementById(type + 'Audio');
            if (audioElement) {
                audioElement.src = audioUrl;
                // Ne pas afficher les contrôles natifs, on les cache complètement
                audioElement.style.display = 'none';
                // Optionnel : ajouter un petit indicateur visuel
                console.log('✅ Audio enregistré, prêt pour transcription');
            }
            
            // Arrêter le stream
            if (currentStream) {
                currentStream.getTracks().forEach(track => track.stop());
                currentStream = null;
            }
            
            // Transcription en temps réel
            showMessage('🔄 Transcription en cours...', 'info');
            await transcribeAudioLive(type, audioBlob);
            
            const submitBtn = document.getElementById('submit' + (type === 'start' ? 'Start' : 'End') + 'Btn');
            if (submitBtn) {
                submitBtn.disabled = false;
            }
        };

        mediaRecorder.onerror = (event) => {
            console.error('❌ Erreur MediaRecorder:', event);
            showMessage('Erreur lors de l\'enregistrement', 'error');
        };

        mediaRecorder.start();
        console.log('▶️ Enregistrement démarré');
        
        const recordBtn = document.getElementById('record' + (type === 'start' ? 'Start' : 'End') + 'Btn');
        const stopBtn = document.getElementById('stop' + (type === 'start' ? 'Start' : 'End') + 'Btn');
        
        if (recordBtn) recordBtn.disabled = true;
        if (stopBtn) stopBtn.disabled = false;
        
        showMessage('🎤 Enregistrement en cours... Parlez maintenant !', 'info');
    } catch (error) {
        console.error('❌ Erreur accès microphone:', error);
        showMessage('Erreur d\'accès au microphone: ' + error.message + '. Vérifiez les permissions.', 'error');
    }
}

function stopRecording(type) {
    console.log('⏹️ Arrêt enregistrement demandé:', type);
    
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        try {
            mediaRecorder.stop();
            console.log('✅ MediaRecorder arrêté');
        } catch (error) {
            console.error('❌ Erreur arrêt MediaRecorder:', error);
        }
    } else {
        console.warn('⚠️ MediaRecorder déjà arrêté ou inexistant');
    }
    
    // Les boutons seront mis à jour dans onstop
    const recordBtn = document.getElementById('record' + (type === 'start' ? 'Start' : 'End') + 'Btn');
    const stopBtn = document.getElementById('stop' + (type === 'start' ? 'Start' : 'End') + 'Btn');
    
    if (recordBtn) recordBtn.disabled = false;
    if (stopBtn) stopBtn.disabled = true;
}

// Transcription en temps réel
async function transcribeAudioLive(type, audioBlob) {
    try {
        console.log('🔄 Début transcription en temps réel pour', type);
        
        const formData = new FormData();
        formData.append('audio', audioBlob, `${type}.webm`);

        const response = await fetch(`${API_BASE_URL}/worker/transcribe`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${currentToken}` },
            body: formData
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        console.log('✅ Transcription reçue:', data);
        
        transcriptions[type] = data.transcript || data.stt_text;
        
        // Afficher la transcription
        displayTranscription(type, transcriptions[type]);
        
        showMessage('✅ Transcription terminée !', 'success');
    } catch (error) {
        console.error('❌ Erreur transcription:', error);
        showMessage('Erreur lors de la transcription: ' + error.message, 'error');
    }
}

// Afficher la transcription dans l'interface
function displayTranscription(type, transcription) {
    if (!transcription || transcription.trim().length === 0) {
        console.warn('⚠️ Transcription vide');
        return;
    }
    
    const transcriptionId = `transcription-${type}`;
    
    // Supprimer l'ancienne transcription si elle existe
    const oldTranscription = document.getElementById(transcriptionId);
    if (oldTranscription) {
        oldTranscription.remove();
    }
    
    // Créer le div de transcription
    const transcriptionDiv = document.createElement('div');
    transcriptionDiv.id = transcriptionId;
    transcriptionDiv.style.cssText = 'margin-top: 15px; padding: 15px; background: #eff6ff; border-radius: 8px; border-left: 4px solid #3b82f6;';
    transcriptionDiv.innerHTML = `
        <strong>📝 Transcription (AssemblyAI) - Live:</strong>
        <p style="margin-top: 5px; font-style: italic; color: #1e40af; font-size: 16px; word-wrap: break-word;">"${transcription}"</p>
    `;
    
    // Trouver le bon formulaire
    const formCard = type === 'start' 
        ? document.querySelector('#workerSection .card:first-of-type')
        : document.querySelector('#workerSection .card:nth-of-type(2)');
    
    if (formCard) {
        formCard.appendChild(transcriptionDiv);
        // Scroll vers la transcription
        transcriptionDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
}

// Exposer les fonctions globalement
window.startRecording = startRecording;
window.stopRecording = stopRecording;

// Worker functions
async function loadEmployers() {
    const select = document.getElementById('employerIdInput');
    if (!select) return;

    try {
        select.innerHTML = '<option value="">Chargement...</option>';
        
        if (!currentToken) {
            throw new Error('Non connecté. Veuillez vous reconnecter.');
        }

        const response = await fetch(`${API_BASE_URL}/worker/employers`, {
            headers: { 'Authorization': `Bearer ${currentToken}` }
        });
        
        if (!response.ok) {
            if (response.status === 401) {
                throw new Error('Session expirée. Veuillez vous reconnecter.');
            } else if (response.status === 404) {
                throw new Error('Route non trouvée. Vérifiez que le backend est à jour.');
            } else {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || `Erreur ${response.status} lors du chargement des employeurs`);
            }
        }

        const data = await response.json();
        
        if (data.employers && data.employers.length > 0) {
            select.innerHTML = '<option value="">Sélectionner un employeur</option>';
            data.employers.forEach(employer => {
                const option = document.createElement('option');
                option.value = employer.id;
                option.textContent = `${employer.name} (${employer.email})`;
                select.appendChild(option);
            });
            console.log(`✅ ${data.employers.length} employeur(s) chargé(s)`);
        } else {
            select.innerHTML = '<option value="">Aucun employeur disponible</option>';
            showMessage('Aucun employeur trouvé. Créez d\'abord un compte employer.', 'info');
        }
    } catch (error) {
        console.error('Erreur chargement employeurs:', error);
        select.innerHTML = '<option value="">Erreur de chargement</option>';
        showMessage('Erreur lors du chargement des employeurs', 'error');
    }
}

async function handleStartShift(e) {
    e.preventDefault();
    console.log('🚀 handleStartShift appelé');
    
    if (!audioChunks.start.length) {
        console.warn('⚠️ Pas d\'audio enregistré');
        showMessage('Veuillez enregistrer un audio de check-in', 'error');
        return;
    }

    const employerId = document.getElementById('employerIdInput').value;
    const jobType = document.getElementById('jobType').value;

    console.log('📋 Paramètres:', { employerId, jobType, audioChunks: audioChunks.start.length });

    if (!employerId) {
        console.warn('⚠️ Pas d\'employeur sélectionné');
        showMessage('Veuillez sélectionner un employeur', 'error');
        return;
    }

    console.log('✅ Tous les paramètres OK, début de l\'envoi...');
    try {
        const audioBlob = new Blob(audioChunks.start, { type: 'audio/webm' });
        console.log('🎤 Audio check-in:', {
            size: audioBlob.size,
            type: audioBlob.type,
            duration: audioChunks.start.length + ' chunks'
        });

        const formData = new FormData();
        formData.append('audio', audioBlob, 'checkin.webm');
        formData.append('employer_id', employerId);
        if (jobType) formData.append('job_type', jobType);

        console.log('📤 Envoi du shift start...');
        console.log('📤 URL:', `${API_BASE_URL}/worker/shifts/start`);
        console.log('📤 Employer ID:', employerId);
        console.log('📤 Job Type:', jobType || 'non spécifié');
        showMessage('Envoi en cours...', 'info');

        const startTime = Date.now();
        const response = await fetch(`${API_BASE_URL}/worker/shifts/start`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${currentToken}` },
            body: formData
        });

        const responseTime = Date.now() - startTime;
        console.log(`⏱️ Temps de réponse: ${responseTime}ms`);
        console.log('📥 Status HTTP:', response.status, response.statusText);

        if (!response.ok) {
            const errorText = await response.text();
            console.error('❌ Erreur HTTP:', errorText);
            throw new Error(`HTTP ${response.status}: ${errorText}`);
        }

        const data = await response.json();
        console.log('📥 Réponse reçue:', data);
        console.log('📥 Réponse complète (JSON):', JSON.stringify(data, null, 2));

        if (!response.ok) {
            throw new Error(data.error || 'Erreur lors du démarrage');
        }

        // Afficher TOUTES les données reçues pour debug
        console.log('🔍 Données disponibles:', {
            stt_start_text: data.stt_start_text,
            work_session: data.work_session,
            transcription: data.transcription,
            allKeys: Object.keys(data)
        });

        // Chercher la transcription dans différentes propriétés possibles
        let transcription = null;
        if (data.stt_start_text) {
            transcription = data.stt_start_text;
            console.log('✅ Transcription trouvée dans stt_start_text');
        } else if (data.transcript) {
            transcription = data.transcript;
            console.log('✅ Transcription trouvée dans transcript');
        } else if (data.work_session?.stt_start_text) {
            transcription = data.work_session.stt_start_text;
            console.log('✅ Transcription trouvée dans work_session.stt_start_text');
        } else if (data.transcription) {
            transcription = data.transcription;
            console.log('✅ Transcription trouvée dans transcription');
        } else {
            console.warn('⚠️ Aucune transcription trouvée dans la réponse !');
            console.warn('📋 Clés disponibles:', Object.keys(data));
        }

        if (transcription) {
            console.log('📝 Transcription trouvée:', transcription);
            
            // Supprimer l'ancienne transcription si elle existe
            const oldTranscription = document.querySelector('#transcription-start');
            if (oldTranscription) {
                oldTranscription.remove();
            }
            
            // Afficher la transcription complète dans un message plus visible
            const transcriptionDiv = document.createElement('div');
            transcriptionDiv.id = 'transcription-start';
            transcriptionDiv.style.cssText = 'margin-top: 15px; padding: 15px; background: #eff6ff; border-radius: 8px; border-left: 4px solid #3b82f6;';
            transcriptionDiv.innerHTML = `
                <strong>📝 Transcription (AssemblyAI):</strong>
                <p style="margin-top: 5px; font-style: italic; color: #1e40af; font-size: 16px;">"${transcription}"</p>
            `;
            const formCard = document.querySelector('#workerSection .card:first-of-type');
            if (formCard) {
                formCard.appendChild(transcriptionDiv);
            }
            
            showMessage(`✅ Shift démarré ! Transcription: "${transcription.substring(0, 50)}..."`, 'success');
        } else {
            console.warn('⚠️ Aucune transcription trouvée dans la réponse');
            console.warn('📋 Données complètes:', data);
            showMessage('✅ Shift démarré avec succès ! (Transcription en cours de traitement...)', 'success');
        }

        audioChunks.start = [];
        document.getElementById('startAudio').style.display = 'none';
        document.getElementById('submitStartBtn').disabled = true;
        loadWorkerShifts();
    } catch (error) {
        console.error('❌ Erreur start shift:', error);
        showMessage('Erreur: ' + error.message, 'error');
    }
}

async function handleEndShift(e) {
    e.preventDefault();
    
    if (!audioChunks.end.length) {
        showMessage('Veuillez enregistrer un audio de check-out', 'error');
        return;
    }

    const workSessionId = document.getElementById('activeShiftSelect').value;

    if (!workSessionId) {
        showMessage('Veuillez sélectionner un shift', 'error');
        return;
    }

    try {
        const audioBlob = new Blob(audioChunks.end, { type: 'audio/webm' });
        console.log('🎤 Audio check-out:', {
            size: audioBlob.size,
            type: audioBlob.type,
            duration: audioChunks.end.length + ' chunks'
        });

        const formData = new FormData();
        formData.append('audio', audioBlob, 'checkout.webm');
        formData.append('work_session_id', workSessionId);

        console.log('📤 Envoi du shift end...');
        showMessage('Envoi en cours...', 'info');

        const response = await fetch(`${API_BASE_URL}/worker/shifts/end`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${currentToken}` },
            body: formData
        });

        const data = await response.json();
        console.log('📥 Réponse reçue:', data);

        if (!response.ok) {
            throw new Error(data.error || 'Erreur lors de la fin du shift');
        }

        // Afficher les détails
        let message = `✅ Shift terminé ! `;
        if (data.hours) message += `${data.hours}h - `;
        if (data.amount_total) message += `${data.amount_total} XRP`;
        
        if (data.stt_end_text) {
            console.log('📝 Transcription check-out:', data.stt_end_text);
            
            // Afficher la transcription complète dans un message visible
            const transcriptionDiv = document.createElement('div');
            transcriptionDiv.style.cssText = 'margin-top: 15px; padding: 15px; background: #f0fdf4; border-radius: 8px; border-left: 4px solid #10b981;';
            transcriptionDiv.innerHTML = `
                <strong>📝 Transcription check-out:</strong>
                <p style="margin-top: 5px; font-style: italic; color: #059669;">"${data.stt_end_text}"</p>
            `;
            document.querySelector('#workerSection .card:nth-of-type(2)').appendChild(transcriptionDiv);
            
            message += `\n📝 Transcription: "${data.stt_end_text.substring(0, 80)}..."`;
        }

        showMessage(message, 'success');
        audioChunks.end = [];
        document.getElementById('endAudio').style.display = 'none';
        document.getElementById('submitEndBtn').disabled = true;
        loadWorkerShifts();
    } catch (error) {
        console.error('❌ Erreur end shift:', error);
        showMessage('Erreur: ' + error.message, 'error');
    }
}

async function loadWorkerShifts() {
    const listDiv = document.getElementById('workerShiftsList');
    listDiv.innerHTML = '<div class="loading">Chargement...</div>';

    try {
        const response = await fetch(`${API_BASE_URL}/worker/shifts`, {
            headers: { 'Authorization': `Bearer ${currentToken}` }
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Erreur de chargement');
        }

        if (data.shifts.length === 0) {
            listDiv.innerHTML = '<p>Aucun shift pour le moment</p>';
            return;
        }

        listDiv.innerHTML = data.shifts.map(shift => {
            const statusColors = {
                'ongoing': '#667eea',
                'proposed': '#f59e0b',
                'validated': '#10b981',
                'paid': '#059669',
                'refused': '#ef4444',
                'disputed': '#f97316'
            };
            const statusLabels = {
                'ongoing': 'En cours',
                'proposed': 'Proposé',
                'validated': 'Validé',
                'paid': 'Payé',
                'refused': 'Refusé',
                'disputed': 'Disputé'
            };
            
            const startDate = shift.start_time ? new Date(shift.start_time).toLocaleString('fr-FR') : 'N/A';
            const endDate = shift.end_time ? new Date(shift.end_time).toLocaleString('fr-FR') : 'En cours...';
            const hours = shift.hours ? `${shift.hours}h` : '-';
            const amount = shift.amount_total ? `${shift.amount_total} XRP` : '-';
            
            const xrplLinks = [];
            if (shift.xrpl_escrow_tx) {
                xrplLinks.push(`<a href="https://testnet.xrpl.org/transactions/${shift.xrpl_escrow_tx}" target="_blank" onclick="event.stopPropagation();" style="text-decoration: none; color: #3b82f6; font-size: 12px; margin-right: 10px;">🔒 Escrow</a>`);
            }
            if (shift.xrpl_nft_id) {
                xrplLinks.push(`<a href="https://testnet.xrpl.org/nft/${shift.xrpl_nft_id}" target="_blank" onclick="event.stopPropagation();" style="text-decoration: none; color: #8b5cf6; font-size: 12px; margin-right: 10px;">🎨 NFT</a>`);
            }
            if (shift.xrpl_payment_tx) {
                xrplLinks.push(`<a href="https://testnet.xrpl.org/transactions/${shift.xrpl_payment_tx}" target="_blank" onclick="event.stopPropagation();" style="text-decoration: none; color: #10b981; font-size: 12px; margin-right: 10px;">💰 Payment</a>`);
            }
            
            return `
                <div class="shift-card" onclick="showShiftDetails('${shift.id}')" style="
                    padding: 15px;
                    margin: 10px 0;
                    background: white;
                    border-radius: 8px;
                    border-left: 4px solid ${statusColors[shift.status] || '#666'};
                    cursor: pointer;
                    transition: transform 0.2s, box-shadow 0.2s;
                " onmouseover="this.style.transform='translateX(5px)'; this.style.boxShadow='0 4px 12px rgba(0,0,0,0.1)'" 
                   onmouseout="this.style.transform=''; this.style.boxShadow=''">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <div style="flex: 1;">
                            <strong style="color: ${statusColors[shift.status] || '#666'}">${statusLabels[shift.status] || shift.status}</strong>
                            <div style="margin-top: 5px; font-size: 14px; color: #666;">
                                ${startDate} → ${endDate}
                            </div>
                            <div style="margin-top: 5px; font-size: 14px;">
                                ⏱️ ${hours} | 💰 ${amount}
                            </div>
                            ${xrplLinks.length > 0 ? `
                            <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #e5e7eb;">
                                <span style="font-size: 11px; color: #9ca3af;">🔗 Blockchain:</span>
                                ${xrplLinks.join('')}
                            </div>
                            ` : ''}
                        </div>
                        <div style="font-size: 20px; margin-left: 10px;">👆</div>
                    </div>
                </div>
            `;
        }).join('');

        // Mettre à jour la liste des shifts actifs
        const activeShifts = data.shifts.filter(s => !s.end_time);
        const select = document.getElementById('activeShiftSelect');
        select.innerHTML = '<option value="">Sélectionner un shift actif</option>' +
            activeShifts.map(s => `<option value="${s.id}">Shift #${s.id.substring(0, 8)} - ${new Date(s.start_time).toLocaleString()}</option>`).join('');

    } catch (error) {
        listDiv.innerHTML = `<p class="error">Erreur: ${error.message}</p>`;
    }
}

// Variable pour stocker le statut actuel
let currentEmployerTab = 'proposed';

// Fonction pour changer d'onglet
function showEmployerTab(status) {
    if (!document.getElementById('tabProposed')) {
        // Les onglets ne sont pas encore chargés, attendre un peu
        setTimeout(() => showEmployerTab(status), 100);
        return;
    }
    currentEmployerTab = status;
    
    // Mettre à jour l'apparence des onglets
    document.getElementById('tabProposed').style.background = status === 'proposed' ? '#3b82f6' : '#e5e7eb';
    document.getElementById('tabProposed').style.color = status === 'proposed' ? 'white' : '#666';
    document.getElementById('tabValidated').style.background = status === 'validated' ? '#3b82f6' : '#e5e7eb';
    document.getElementById('tabValidated').style.color = status === 'validated' ? 'white' : '#666';
    document.getElementById('tabPaid').style.background = status === 'paid' ? '#3b82f6' : '#e5e7eb';
    document.getElementById('tabPaid').style.color = status === 'paid' ? 'white' : '#666';
    
    // Mettre à jour le titre
    const titles = {
        'proposed': 'Shifts à valider',
        'validated': 'Shifts validés',
        'paid': 'Shifts payés'
    };
    document.getElementById('employerShiftsTitle').textContent = titles[status] || 'Shifts';
    
    // Charger les shifts
    loadEmployerShifts(status);
}

// Fonction pour actualiser
function refreshEmployerShifts() {
    loadEmployerShifts(currentEmployerTab);
}

// Employer functions
async function loadEmployerShifts(status = 'proposed') {
    console.log('🔄 loadEmployerShifts appelée, status:', status);
    console.log('Token:', currentToken ? 'Présent' : 'MANQUANT');
    console.log('User:', currentUser);
    
    const listDiv = document.getElementById('employerShiftsList');
    
    if (!listDiv) {
        console.error('❌ employerShiftsList element not found');
        showMessage('Erreur: élément DOM non trouvé', 'error');
        return;
    }
    
    if (!currentToken) {
        console.error('❌ Token manquant');
        showMessage('Erreur: vous devez être connecté', 'error');
        return;
    }
    
    listDiv.innerHTML = '<div class="loading">Chargement...</div>';
    showMessage('Chargement des shifts...', 'info');

    try {
        const url = status ? `${API_BASE_URL}/employer/shifts?status=${status}` : `${API_BASE_URL}/employer/shifts`;
        console.log('📡 Appel API:', url);
        
        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${currentToken}` }
        });

        console.log('📥 Réponse status:', response.status);

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: 'Erreur HTTP ' + response.status }));
            console.error('❌ Erreur API:', errorData);
            throw new Error(errorData.error || 'Erreur de chargement');
        }

        const data = await response.json();
        console.log('✅ Données reçues:', data);

        if (!data.shifts || data.shifts.length === 0) {
            const messages = {
                'proposed': {
                    title: '📭 Aucun shift à valider pour le moment',
                    description: 'Pour voir des shifts ici, un worker doit d\'abord créer un shift.',
                    help: true
                },
                'validated': {
                    title: '📭 Aucun shift validé pour le moment',
                    description: 'Les shifts validés apparaîtront ici une fois que vous les aurez validés.',
                    help: false
                },
                'paid': {
                    title: '📭 Aucun shift payé pour le moment',
                    description: 'Les shifts payés apparaîtront ici une fois que vous aurez libéré le paiement.',
                    help: false
                }
            };
            
            const msg = messages[status] || messages['proposed'];
            
            let helpContent = '';
            if (msg.help) {
                helpContent = `
                    <div style="background: white; padding: 15px; border-radius: 5px; text-align: left; max-width: 500px; margin: 0 auto;">
                        <p style="font-weight: bold; margin-bottom: 10px;">💡 Comment créer un shift :</p>
                        <ol style="text-align: left; padding-left: 20px; margin: 0;">
                            <li>Connectez-vous en tant que <strong>worker</strong> (alice@test.com)</li>
                            <li>Démarrez un shift avec enregistrement audio</li>
                            <li>Terminez le shift</li>
                            <li>Reconnectez-vous en tant qu'<strong>employer</strong> pour valider</li>
                        </ol>
                    </div>
                `;
            }
            
            listDiv.innerHTML = `
                <div style="padding: 20px; text-align: center; background: #f0f0f0; border-radius: 8px;">
                    <p style="font-size: 16px; margin-bottom: 10px;">${msg.title}</p>
                    <p style="font-size: 14px; color: #666; margin-bottom: 15px;">${msg.description}</p>
                    ${helpContent}
                </div>
            `;
            showMessage(`Aucun shift ${status === 'proposed' ? 'à valider' : status === 'validated' ? 'validé' : 'payé'} pour le moment`, 'info');
            return;
        }

        listDiv.innerHTML = data.shifts.map(shift => {
            const xrplLinks = [];
            if (shift.xrpl_escrow_tx) {
                xrplLinks.push(`<a href="https://testnet.xrpl.org/transactions/${shift.xrpl_escrow_tx}" target="_blank" style="text-decoration: none; color: #3b82f6; font-size: 12px; margin-right: 10px; padding: 4px 8px; background: #eff6ff; border-radius: 4px;">🔒 Escrow</a>`);
            }
            if (shift.xrpl_nft_id) {
                xrplLinks.push(`<a href="https://testnet.xrpl.org/nft/${shift.xrpl_nft_id}" target="_blank" style="text-decoration: none; color: #8b5cf6; font-size: 12px; margin-right: 10px; padding: 4px 8px; background: #f5f3ff; border-radius: 4px;">🎨 NFT</a>`);
            }
            if (shift.xrpl_payment_tx) {
                xrplLinks.push(`<a href="https://testnet.xrpl.org/transactions/${shift.xrpl_payment_tx}" target="_blank" style="text-decoration: none; color: #10b981; font-size: 12px; margin-right: 10px; padding: 4px 8px; background: #f0fdf4; border-radius: 4px;">💰 Payment</a>`);
            }
            
            return `
            <div class="shift-item">
                <h4>Shift #${shift.id.substring(0, 8)} - ${shift.worker_name}</h4>
                <p><strong>Début:</strong> ${new Date(shift.start_time).toLocaleString()}</p>
                ${shift.end_time ? `<p><strong>Fin:</strong> ${new Date(shift.end_time).toLocaleString()}</p>` : ''}
                ${shift.hours ? `<p><strong>Heures:</strong> ${shift.hours}h</p>` : ''}
                ${shift.amount_total ? `<p><strong>Montant:</strong> ${shift.amount_total} XRP</p>` : ''}
                <p><strong>Transcription:</strong> ${shift.stt_start_text || 'N/A'}</p>
                ${shift.stt_end_text ? `<p><strong>Check-out:</strong> ${shift.stt_end_text}</p>` : ''}
                ${xrplLinks.length > 0 ? `
                <div style="margin: 10px 0; padding: 10px; background: #f9fafb; border-radius: 6px; border-left: 3px solid #667eea;">
                    <strong style="font-size: 12px; color: #667eea;">🔗 Blockchain XRPL:</strong>
                    <div style="margin-top: 5px;">
                        ${xrplLinks.join('')}
                    </div>
                </div>
                ` : ''}
                <span class="status ${shift.status}">${shift.status}</span>
                <div class="shift-actions">
                    ${shift.status === 'proposed' ? `
                        ${!shift.end_time ? `
                            <button onclick="validateShift('${shift.id}')" style="background: #f59e0b; opacity: 0.7;" title="Le shift n'a pas été terminé par le worker. L'heure actuelle sera utilisée.">⚠️ Valider (shift non terminé)</button>
                        ` : `
                            <button onclick="validateShift('${shift.id}')">✅ Valider</button>
                        `}
                        <button onclick="refuseShift('${shift.id}')">❌ Refuser</button>
                    ` : ''}
                    ${shift.status === 'validated' ? `
                        <button onclick="releasePayment('${shift.id}')">💰 Libérer paiement</button>
                        <button onclick="showShiftDetails('${shift.id}')">👁️ Voir détails</button>
                    ` : ''}
                    ${shift.status === 'paid' ? `
                        <button onclick="showShiftDetails('${shift.id}')">👁️ Voir détails</button>
                    ` : ''}
                </div>
            </div>
        `;
        }).join('');
        
        showMessage(`${data.shifts.length} shift(s) trouvé(s)`, 'success');

    } catch (error) {
        console.error('❌ Erreur loadEmployerShifts:', error);
        listDiv.innerHTML = `<p class="error">Erreur: ${error.message}</p>`;
        showMessage('Erreur lors du chargement: ' + error.message, 'error');
    }
}

async function validateShift(shiftId) {
    try {
        showMessage('Validation en cours...', 'info');
        const response = await fetch(`${API_BASE_URL}/employer/shifts/${shiftId}/validate`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${currentToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({})
        });

        const data = await response.json();

        if (!response.ok) {
            console.error('❌ Erreur validation:', data);
            let errorMsg = data.error || 'Erreur de validation';
            if (data.details) {
                errorMsg += ': ' + data.details;
            }
            if (data.xrpl_error) {
                console.error('XRPL error:', data.xrpl_error);
            }
            throw new Error(errorMsg);
        }

        const escrowLink = data.xrpl_escrow_tx ? ` <a href="https://testnet.xrpl.org/transactions/${data.xrpl_escrow_tx}" target="_blank" style="color: white; text-decoration: underline;">Voir sur XRPL</a>` : '';
        showMessage(`Shift validé ! Escrow créé.${escrowLink}`, 'success');
        loadEmployerShifts();
    } catch (error) {
        console.error('❌ Erreur complète:', error);
        showMessage('Erreur: ' + error.message, 'error');
    }
}

async function refuseShift(shiftId) {
    if (!confirm('Êtes-vous sûr de vouloir refuser ce shift ?')) return;

    try {
        const response = await fetch(`${API_BASE_URL}/employer/shifts/${shiftId}/refuse`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${currentToken}` }
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Erreur');
        }

        showMessage('Shift refusé', 'info');
        loadEmployerShifts();
    } catch (error) {
        showMessage('Erreur: ' + error.message, 'error');
    }
}

async function releasePayment(shiftId) {
    try {
        showMessage('Libération du paiement en cours...', 'info');
        const response = await fetch(`${API_BASE_URL}/shifts/${shiftId}/release`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${currentToken}`,
                'Content-Type': 'application/json'
            }
        });

        const data = await response.json();

        if (!response.ok) {
            console.error('❌ Erreur release payment:', data);
            let errorMsg = data.error || 'Erreur lors de la libération du paiement';
            if (data.details) {
                errorMsg += ': ' + data.details;
            }
            throw new Error(errorMsg);
        }

        const paymentLink = data.xrpl_payment_tx ? ` <a href="https://testnet.xrpl.org/transactions/${data.xrpl_payment_tx}" target="_blank" style="color: white; text-decoration: underline;">Voir sur XRPL</a>` : '';
        showMessage(`Paiement libéré avec succès !${paymentLink}`, 'success');
        // Recharger les shifts de l'onglet actuel
        loadEmployerShifts(currentEmployerTab);
    } catch (error) {
        console.error('❌ Erreur complète release payment:', error);
        showMessage('Erreur: ' + error.message, 'error');
    }
}

// Exposer les fonctions globalement (à la fin du fichier)
// Les fonctions sont déjà dans le scope global, mais on s'assure qu'elles sont accessibles

// Afficher les détails d'un shift
async function showShiftDetails(shiftId) {
    console.log('🔍 Chargement détails shift:', shiftId);
    const modal = document.getElementById('shiftModal');
    const content = document.getElementById('shiftModalContent');
    
    modal.style.display = 'block';
    content.innerHTML = '<div class="loading">Chargement...</div>';

    try {
        // Utiliser l'endpoint générique /shifts/:id qui fonctionne pour tous les rôles
        const response = await fetch(`${API_BASE_URL}/shifts/${shiftId}`, {
            headers: { 'Authorization': `Bearer ${currentToken}` }
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: 'Erreur HTTP ' + response.status }));
            throw new Error(errorData.error || 'Erreur de chargement');
        }

        const shift = await response.json();
        
        if (!shift || !shift.id) {
            throw new Error('Shift non trouvé');
        }

        const statusColors = {
            'ongoing': '#667eea',
            'proposed': '#f59e0b',
            'validated': '#10b981',
            'paid': '#059669',
            'refused': '#ef4444',
            'disputed': '#f97316'
        };
        const statusLabels = {
            'ongoing': 'En cours',
            'proposed': 'Proposé',
            'validated': 'Validé',
            'paid': 'Payé',
            'refused': 'Refusé',
            'disputed': 'Disputé'
        };

        content.innerHTML = `
            <div style="line-height: 1.8;">
                <div style="margin-bottom: 20px; padding: 15px; background: #f9fafb; border-radius: 8px;">
                    <strong style="color: ${statusColors[shift.status] || '#666'}; font-size: 18px;">
                        ${statusLabels[shift.status] || shift.status}
                    </strong>
                </div>

                ${shift.worker_name || shift.employer_name ? `
                <div style="margin-bottom: 20px;">
                    <h3 style="margin-bottom: 10px;">👥 Participants</h3>
                    ${shift.worker_name ? `<p><strong>Worker:</strong> ${shift.worker_name}</p>` : ''}
                    ${shift.employer_name ? `<p><strong>Employeur:</strong> ${shift.employer_name}</p>` : ''}
                </div>
                ` : ''}
                
                <div style="margin-bottom: 20px;">
                    <h3 style="margin-bottom: 10px;">⏰ Horaires</h3>
                    <p><strong>Début:</strong> ${shift.start_time ? new Date(shift.start_time).toLocaleString('fr-FR') : 'N/A'}</p>
                    <p><strong>Fin:</strong> ${shift.end_time ? new Date(shift.end_time).toLocaleString('fr-FR') : 'En cours...'}</p>
                    <p><strong>Durée:</strong> ${shift.hours ? `${shift.hours} heures` : 'En cours...'}</p>
                </div>

                ${shift.stt_start_text ? `
                <div style="margin-bottom: 20px; padding: 15px; background: #eff6ff; border-radius: 8px; border-left: 4px solid #3b82f6;">
                    <h3 style="margin-bottom: 10px;">🎤 Transcription Check-in</h3>
                    <p style="font-style: italic; color: #1e40af;">"${shift.stt_start_text}"</p>
                </div>
                ` : ''}

                ${shift.stt_end_text ? `
                <div style="margin-bottom: 20px; padding: 15px; background: #f0fdf4; border-radius: 8px; border-left: 4px solid #10b981;">
                    <h3 style="margin-bottom: 10px;">🎤 Transcription Check-out</h3>
                    <p style="font-style: italic; color: #059669;">"${shift.stt_end_text}"</p>
                </div>
                ` : ''}

                ${shift.llm_structured_json ? `
                <div style="margin-bottom: 20px; padding: 15px; background: #fef3c7; border-radius: 8px;">
                    <h3 style="margin-bottom: 10px;">🤖 Analyse LLM</h3>
                    <pre style="background: white; padding: 10px; border-radius: 5px; overflow-x: auto; font-size: 12px;">${JSON.stringify(shift.llm_structured_json, null, 2)}</pre>
                </div>
                ` : ''}

                <div style="margin-bottom: 20px;">
                    <h3 style="margin-bottom: 10px;">💰 Paiement</h3>
                    <p><strong>Taux horaire:</strong> ${shift.hourly_rate ? `${shift.hourly_rate} XRP/h` : 'Non défini'}</p>
                    <p><strong>Montant total:</strong> ${shift.amount_total ? `${shift.amount_total} XRP` : 'Non calculé'}</p>
                </div>

                ${shift.xrpl_escrow_tx || shift.xrpl_nft_id || shift.xrpl_payment_tx ? `
                <div style="margin-bottom: 20px; padding: 20px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 8px; color: white;">
                    <h3 style="margin-bottom: 15px; color: white;">🔗 Blockchain XRPL</h3>
                    <div style="display: flex; flex-direction: column; gap: 10px;">
                        ${shift.xrpl_escrow_tx ? `
                        <a href="https://testnet.xrpl.org/transactions/${shift.xrpl_escrow_tx}" target="_blank" 
                           style="display: inline-flex; align-items: center; gap: 8px; padding: 10px 15px; background: rgba(255,255,255,0.2); border-radius: 6px; color: white; text-decoration: none; transition: background 0.3s;"
                           onmouseover="this.style.background='rgba(255,255,255,0.3)'" 
                           onmouseout="this.style.background='rgba(255,255,255,0.2)'">
                            <span>🔒</span>
                            <span><strong>Escrow:</strong> ${shift.xrpl_escrow_tx.substring(0, 16)}...${shift.xrpl_escrow_tx.substring(shift.xrpl_escrow_tx.length - 8)}</span>
                            <span style="margin-left: auto;">🔗</span>
                        </a>
                        ` : ''}
                        ${shift.xrpl_nft_id ? `
                        <a href="https://testnet.xrpl.org/nft/${shift.xrpl_nft_id}" target="_blank" 
                           style="display: inline-flex; align-items: center; gap: 8px; padding: 10px 15px; background: rgba(255,255,255,0.2); border-radius: 6px; color: white; text-decoration: none; transition: background 0.3s;"
                           onmouseover="this.style.background='rgba(255,255,255,0.3)'" 
                           onmouseout="this.style.background='rgba(255,255,255,0.2)'">
                            <span>🎨</span>
                            <span><strong>NFT:</strong> ${shift.xrpl_nft_id.substring(0, 16)}...${shift.xrpl_nft_id.substring(shift.xrpl_nft_id.length - 8)}</span>
                            <span style="margin-left: auto;">🔗</span>
                        </a>
                        ` : ''}
                        ${shift.xrpl_payment_tx ? `
                        <a href="https://testnet.xrpl.org/transactions/${shift.xrpl_payment_tx}" target="_blank" 
                           style="display: inline-flex; align-items: center; gap: 8px; padding: 10px 15px; background: rgba(255,255,255,0.2); border-radius: 6px; color: white; text-decoration: none; transition: background 0.3s;"
                           onmouseover="this.style.background='rgba(255,255,255,0.3)'" 
                           onmouseout="this.style.background='rgba(255,255,255,0.2)'">
                            <span>💰</span>
                            <span><strong>Paiement:</strong> ${shift.xrpl_payment_tx.substring(0, 16)}...${shift.xrpl_payment_tx.substring(shift.xrpl_payment_tx.length - 8)}</span>
                            <span style="margin-left: auto;">🔗</span>
                        </a>
                        ` : ''}
                    </div>
                    <p style="margin-top: 15px; font-size: 12px; opacity: 0.9;">
                        💡 Cliquez sur les liens pour voir les transactions sur l'explorer XRPL Testnet
                    </p>
                </div>
                ` : ''}

                <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
                    <p style="font-size: 12px; color: #6b7280;">
                        <strong>ID:</strong> ${shift.id}<br>
                        <strong>Créé:</strong> ${shift.created_at ? new Date(shift.created_at).toLocaleString('fr-FR') : 'N/A'}
                    </p>
                </div>
            </div>
        `;
    } catch (error) {
        console.error('❌ Erreur chargement détails:', error);
        content.innerHTML = `<div style="color: #ef4444;">Erreur: ${error.message}</div>`;
    }
}

function closeShiftModal() {
    document.getElementById('shiftModal').style.display = 'none';
}

// Utility functions
function showMessage(text, type = 'info') {
    const messageDiv = document.getElementById('message');
    messageDiv.textContent = text;
    messageDiv.className = `message ${type}`;
    messageDiv.style.display = 'block';

    setTimeout(() => {
        messageDiv.style.display = 'none';
    }, 5000);
}

