// Configuration - CHANGE THIS TO YOUR GOOGLE APPS SCRIPT URL
const GOOGLE_APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwBblBJsvCQn5O09ZqxbPCUXpEsJyiGu1qpluPM9N6dTxdZlYJiKTKTi69wW0a4nBUFdw/exec';

const STORAGE_KEY = 'problems_data';
const SYNC_INTERVAL = 5000; // Sync every 5 seconds

class ProblemManager {
    constructor() {
        this.problems = [];
        this.currentFilter = 'all';
        this.isOnline = navigator.onLine;
        this.syncInProgress = false;
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.setDefaultDate();
        this.loadProblems();
        
        // Monitor online/offline
        window.addEventListener('online', () => this.handleOnline());
        window.addEventListener('offline', () => this.handleOffline());

        // Sync data periodically
        setInterval(() => this.syncWithSheet(), SYNC_INTERVAL);
    }

    setupEventListeners() {
        document.getElementById('problemForm').addEventListener('submit', (e) => this.handleSubmit(e));

        document.querySelectorAll('.sbu-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.selectSBU(e));
        });

        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.setFilter(e));
        });

        document.querySelectorAll('.modal-close, .btn-cancel').forEach(btn => {
            btn.addEventListener('click', (e) => this.closeModal(e));
        });

        document.getElementById('solutionModal').addEventListener('click', (e) => {
            if (e.target.id === 'solutionModal') this.closeModal(e);
        });
        document.getElementById('viewSolutionModal').addEventListener('click', (e) => {
            if (e.target.id === 'viewSolutionModal') this.closeModal(e);
        });

        // Status indicator
        this.addStatusIndicator();
    }

    addStatusIndicator() {
        const indicator = document.createElement('div');
        indicator.id = 'syncStatus';
        indicator.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 10px 15px;
            background: #10b981;
            color: white;
            border-radius: 4px;
            font-size: 0.85rem;
            font-weight: bold;
            z-index: 999;
            display: none;
        `;
        document.body.appendChild(indicator);
    }

    showSyncStatus(message, type = 'success') {
        const indicator = document.getElementById('syncStatus');
        indicator.textContent = message;
        indicator.style.background = type === 'success' ? '#10b981' : '#ef4444';
        indicator.style.display = 'block';
        
        if (type === 'success') {
            setTimeout(() => indicator.style.display = 'none', 3000);
        }
    }

    handleOnline() {
        this.isOnline = true;
        this.showSyncStatus('🟢 Online - Syncing...');
        this.syncWithSheet();
    }

    handleOffline() {
        this.isOnline = false;
        this.showSyncStatus('⚠️ Offline - Using local data', 'warning');
    }

    setDefaultDate() {
        const today = new Date().toISOString().split('T')[0];
        document.getElementById('problemDate').value = today;
    }

    selectSBU(e) {
        document.querySelectorAll('.sbu-btn').forEach(btn => btn.classList.remove('active'));
        e.target.classList.add('active');
        document.getElementById('selectedSBU').value = e.target.dataset.sbu;
    }

    async handleSubmit(e) {
        e.preventDefault();

        const sbu = document.getElementById('selectedSBU').value;
        const name = document.getElementById('yourName').value;
        const date = document.getElementById('problemDate').value;
        const problem = document.getElementById('problemDesc').value;
        const suggested = document.getElementById('suggestedSolution').value;

        if (!sbu) {
            this.showError('Please select an SBU');
            return;
        }

        const newProblem = {
            id: Date.now().toString(),
            sbu,
            name,
            date,
            problem,
            suggested,
            solution: null,
            status: 'open',
            createdAt: new Date().toISOString()
        };

        // Add to local storage first
        this.problems.unshift(newProblem);
        this.saveProblems();

        // Try to sync with sheet
        if (this.isOnline) {
            const success = await this.addProblemToSheet(newProblem);
            if (success) {
                this.showSyncStatus('✓ Problem added to sheet');
            } else {
                this.showSyncStatus('✗ Failed to sync (saved locally)', 'error');
            }
        } else {
            this.showSyncStatus('📱 Offline - Problem saved locally');
        }

        this.resetForm();
        this.render();
    }

    async addProblemToSheet(problem) {
        try {
            const response = await fetch(GOOGLE_APPS_SCRIPT_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'addProblem',
                    ...problem
                })
            });

            const result = await response.json();
            return result.success;
        } catch (error) {
            console.error('Error adding problem:', error);
            return false;
        }
    }

    async syncWithSheet() {
        if (!this.isOnline || this.syncInProgress) return;

        this.syncInProgress = true;

        try {
            const response = await fetch(`${GOOGLE_APPS_SCRIPT_URL}?action=getProblems`);
            const result = await response.json();

            if (result.success) {
                this.problems = result.problems;
                this.saveProblems();
                this.render();
                console.log('✓ Synced with Google Sheet');
            }
        } catch (error) {
            console.error('Sync error:', error);
        } finally {
            this.syncInProgress = false;
        }
    }

    resetForm() {
        document.getElementById('problemForm').reset();
        document.querySelectorAll('.sbu-btn').forEach(btn => btn.classList.remove('active'));
        document.getElementById('selectedSBU').value = '';
        document.getElementById('formError').classList.remove('show');
        this.setDefaultDate();
    }

    showError(message) {
        const errorEl = document.getElementById('formError');
        errorEl.textContent = message;
        errorEl.classList.add('show');
        setTimeout(() => errorEl.classList.remove('show'), 3000);
    }

    setFilter(e) {
        document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
        e.target.closest('.filter-btn').classList.add('active');
        this.currentFilter = e.target.closest('.filter-btn').dataset.filter;
        this.render();
    }

    openSolutionModal(problemId) {
        const problem = this.problems.find(p => p.id == problemId);
        if (!problem) return;

        const modal = document.getElementById('solutionModal');
        const detail = document.getElementById('modalProblemDetail');

        detail.innerHTML = `
            <div class="detail-row">
                <span class="detail-label">SBU:</span>
                <span class="detail-value">${problem.sbu}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Reporter:</span>
                <span class="detail-value">${problem.name}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Date:</span>
                <span class="detail-value">${new Date(problem.date).toLocaleDateString()}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Problem:</span>
                <span class="detail-value">${problem.problem}</span>
            </div>
        `;

        document.getElementById('managerSolution').value = '';
        document.getElementById('saveSolutionBtn').onclick = () => this.saveSolution(problemId);

        modal.classList.add('show');
    }

    async saveSolution(problemId) {
        const solution = document.getElementById('managerSolution').value.trim();
        if (!solution) {
            alert('Please enter a solution');
            return;
        }

        const problem = this.problems.find(p => p.id == problemId);
        problem.solution = solution;

        // Update locally first
        this.saveProblems();

        // Sync with sheet
        if (this.isOnline) {
            const success = await this.updateSolutionInSheet(problemId, solution);
            if (success) {
                this.showSyncStatus('✓ Solution saved to sheet');
            } else {
                this.showSyncStatus('✗ Failed to sync solution', 'error');
            }
        }

        this.closeModal();
        this.render();
    }

    async updateSolutionInSheet(problemId, solution) {
        try {
            const response = await fetch(GOOGLE_APPS_SCRIPT_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'updateSolution',
                    id: problemId,
                    solution
                })
            });

            const result = await response.json();
            return result.success;
        } catch (error) {
            console.error('Error updating solution:', error);
            return false;
        }
    }

    openViewSolutionModal(problemId) {
        const problem = this.problems.find(p => p.id == problemId);
        if (!problem || !problem.solution) return;

        const modal = document.getElementById('viewSolutionModal');
        const detail = document.getElementById('viewProblemDetail');
        const solutionDiv = document.getElementById('viewSolution');

        detail.innerHTML = `
            <div class="detail-row">
                <span class="detail-label">SBU:</span>
                <span class="detail-value">${problem.sbu}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Reporter:</span>
                <span class="detail-value">${problem.name}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Date:</span>
                <span class="detail-value">${new Date(problem.date).toLocaleDateString()}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Status:</span>
                <span class="detail-value"><span class="status-badge ${problem.status}">${problem.status}</span></span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Problem:</span>
                <span class="detail-value">${problem.problem}</span>
            </div>
        `;

        solutionDiv.textContent = problem.solution;

        document.getElementById('progressBtn').onclick = () => this.updateStatus(problemId, 'in-progress');
        document.getElementById('solvedBtn').onclick = () => this.updateStatus(problemId, 'solved');

        modal.classList.add('show');
    }

    async updateStatus(problemId, status) {
        const problem = this.problems.find(p => p.id == problemId);
        problem.status = status;

        // Update locally
        this.saveProblems();

        // Sync with sheet
        if (this.isOnline) {
            const success = await this.updateStatusInSheet(problemId, status);
            if (success) {
                this.showSyncStatus(`✓ Status updated to ${status}`);
            }
        }

        this.closeModal();
        this.render();
    }

    async updateStatusInSheet(problemId, status) {
        try {
            const response = await fetch(GOOGLE_APPS_SCRIPT_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'updateStatus',
                    id: problemId,
                    status
                })
            });

            const result = await response.json();
            return result.success;
        } catch (error) {
            console.error('Error updating status:', error);
            return false;
        }
    }

    closeModal(e) {
        if (e) e.preventDefault();
        document.getElementById('solutionModal').classList.remove('show');
        document.getElementById('viewSolutionModal').classList.remove('show');
    }

    getFilteredProblems() {
        if (this.currentFilter === 'all') {
            return this.problems;
        }
        return this.problems.filter(p => p.sbu === this.currentFilter);
    }

    render() {
        this.updateCounts();
        this.renderProblems();
    }

    updateCounts() {
        document.getElementById('ticketsLogged').textContent = this.problems.length;

        const sbus = ['all', 'ACCL', 'APFIL', 'AIL', 'AEL', 'ALEL', 'AAFL', 'MRML'];
        sbus.forEach(sbu => {
            const count = sbu === 'all' ? this.problems.length : this.problems.filter(p => p.sbu === sbu).length;
            const btn = document.querySelector(`[data-filter="${sbu}"]`);
            if (btn) {
                btn.querySelector('.count').textContent = count;
            }
        });
    }

    renderProblems() {
        const container = document.getElementById('problemsList');
        const filtered = this.getFilteredProblems();

        if (filtered.length === 0) {
            container.innerHTML = '<p class="empty-state">No tickets for this filter.</p>';
            return;
        }

        container.innerHTML = filtered.map(problem => `
            <div class="problem-card ${problem.status}">
                <div class="problem-header">
                    <div class="problem-meta">
                        <span class="problem-sbu">${problem.sbu}</span>
                        <div class="problem-title">${problem.problem.substring(0, 50)}${problem.problem.length > 50 ? '...' : ''}</div>
                        <div class="problem-meta-info">
                            <span>${problem.name}</span>
                            <span>${new Date(problem.date).toLocaleDateString()}</span>
                            <span class="status-badge ${problem.status}">${problem.status}</span>
                        </div>
                    </div>
                </div>

                <div class="problem-description">${problem.problem}</div>

                ${problem.suggested ? `
                    <div class="problem-suggested">
                        <strong>Suggested Solution:</strong> ${problem.suggested}
                    </div>
                ` : ''}

                ${problem.solution ? `
                    <div style="background: #f0fdf4; padding: 10px; border-radius: 4px; margin-bottom: 12px; border-left: 3px solid #10b981;">
                        <span class="solution-badge">✓ Solution Available</span>
                    </div>
                ` : ''}

                <div class="problem-actions">
                    ${!problem.solution ? `
                        <button class="btn-small btn-add-solution" onclick="manager.openSolutionModal('${problem.id}')">+ Add Solution</button>
                    ` : ''}
                    ${problem.solution ? `
                        <button class="btn-small btn-view-solution" onclick="manager.openViewSolutionModal('${problem.id}')">View Solution</button>
                    ` : ''}
                </div>
            </div>
        `).join('');
    }

    saveProblems() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.problems));
    }

    loadProblems() {
        const data = localStorage.getItem(STORAGE_KEY);
        this.problems = data ? JSON.parse(data) : [];
        
        // Initial sync if online
        if (this.isOnline) {
            this.syncWithSheet();
        }
    }
}

// Initialize
const manager = new ProblemManager();
