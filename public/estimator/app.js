document.addEventListener('DOMContentLoaded', () => {
    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('fileInput');
    const uploadButton = document.getElementById('uploadButton');
    const uploadForm = document.getElementById('uploadForm');
    const uploadStatus = document.getElementById('uploadStatus');
    const resultsSection = document.getElementById('resultsSection');
    const resultsDisplay = document.getElementById('resultsDisplay');
    const chatMessages = document.getElementById('chatMessages');
    const chatInput = document.getElementById('chatInput');
    const sendButton = document.getElementById('sendButton');
    
    // PDF Viewer elements
    const pdfViewerSection = document.getElementById('pdfViewerSection');
    const pdfContainer = document.getElementById('pdfContainer');
    const prevPageButton = document.getElementById('prevPage');
    const nextPageButton = document.getElementById('nextPage');
    const pageInfo = document.getElementById('pageInfo');
    const zoomInButton = document.getElementById('zoomIn');
    const zoomOutButton = document.getElementById('zoomOut');
    const zoomLevelSpan = document.getElementById('zoomLevel');
    
    // PDF viewer state
    let pdfDoc = null;
    let currentPage = 1;
    let zoomLevel = 100;
    let pdfBytes = null;
    let pageRendering = false;
    let renderPending = null;
    
    // Chat functionality
    let currentSessionId = null; // Store the session ID

    const CHUNK_SIZE = 4 * 1024 * 1024; // 4MB chunks

    // Initialize current session
    let currentSession = null;

    // Initialize chat elements
    const chatDisplay = document.getElementById('chatDisplay');

    // File input change handler
    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            handleFileUpload(file);
        }
    });

    // File upload handling
    uploadButton.addEventListener('click', () => {
        fileInput.click();
    });

    // Make the entire drop zone clickable
    dropZone.addEventListener('click', () => {
        fileInput.click();
    });

    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('border-blue-500');
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('border-blue-500');
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('border-blue-500');
        const file = e.dataTransfer.files[0];
        if (file) {
            handleFileUpload(file);
        }
    });

    async function uploadFileInChunks(file) {
        const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
        let sessionId = null;
        
        // Show progress container
        const progressContainer = document.createElement('div');
        progressContainer.className = 'mt-4';
        progressContainer.innerHTML = `
            <div class="w-full bg-gray-200 rounded-full h-2.5">
                <div class="bg-blue-600 h-2.5 rounded-full" style="width: 0%"></div>
            </div>
            <p class="mt-2 text-sm text-gray-600">Uploading: <span class="upload-progress">0%</span></p>
        `;
        uploadForm.appendChild(progressContainer);
        
        // Disable upload button during processing
        uploadButton.disabled = true;
        uploadButton.classList.add('opacity-50');
        
        try {
            // Upload each chunk
            for (let i = 0; i < totalChunks; i++) {
                const start = i * CHUNK_SIZE;
                const end = Math.min(start + CHUNK_SIZE, file.size);
                const chunk = file.slice(start, end);
                
                const formData = new FormData();
                formData.append('file', chunk, file.name);
                
                const response = await fetch('/upload-chunk', {
                    method: 'POST',
                    body: formData,
                    headers: {
                        'X-Chunk-Index': i.toString(),
                        'X-Total-Chunks': totalChunks.toString(),
                        'X-Session-Id': sessionId || ''
                    }
                });
                
                const data = await response.json();
                sessionId = data.session_id;
                
                // Update progress
                const progress = ((i + 1) / totalChunks) * 100;
                progressContainer.querySelector('.bg-blue-600').style.width = `${progress}%`;
                progressContainer.querySelector('.upload-progress').textContent = `${Math.round(progress)}%`;
            }
            
            // Complete the upload
            const completeResponse = await fetch('/complete-upload', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    session_id: sessionId,
                    total_chunks: totalChunks
                })
            });
            
            const completeData = await completeResponse.json();
            
            // Start polling for status
            pollUploadStatus(sessionId, progressContainer);
            
        } catch (error) {
            console.error('Upload error:', error);
            uploadStatus.textContent = `Error: ${error.message}`;
            uploadStatus.classList.add('text-red-500');
            
            // Clean up
            uploadButton.disabled = false;
            uploadButton.classList.remove('opacity-50');
            if (progressContainer && progressContainer.parentNode) {
                progressContainer.parentNode.removeChild(progressContainer);
            }
        }
    }

    async function pollUploadStatus(sessionId, progressContainer) {
        try {
            const response = await fetch(`/upload-status/${sessionId}`);
            const data = await response.json();
            
            if (data.status === 'error') {
                throw new Error(data.message);
            }
            
            if (data.status === 'success') {
                // Update UI for success
                resultsSection.classList.remove('hidden');
                pdfViewerSection.classList.remove('hidden');
                uploadStatus.textContent = 'Upload successful!';
                uploadStatus.classList.add('text-green-500');
                resultsDisplay.textContent = JSON.stringify(data, null, 2);
                
                if (data.session_id) {
                    currentSessionId = data.session_id;
                    console.log(`Session ID set to: ${currentSessionId}`);
                    
                    // Add a welcome message
                    addMessageToChat('system', 'Drawing analyzed! You can now ask questions about it.');
                }

                // Render the PDF
                renderPDF(data.page_paths[0]);
                
            } else if (data.status === 'processing') {
                // Update progress message
                progressContainer.querySelector('.upload-progress').textContent = 'Processing...';
                // Continue polling
                setTimeout(() => pollUploadStatus(sessionId, progressContainer), 2000);
            }
        } catch (error) {
            console.error('Status check error:', error);
            uploadStatus.textContent = `Error: ${error.message}`;
            uploadStatus.classList.add('text-red-500');
            
            // Clean up
            uploadButton.disabled = false;
            uploadButton.classList.remove('opacity-50');
            if (progressContainer && progressContainer.parentNode) {
                progressContainer.parentNode.removeChild(progressContainer);
            }
        }
    }

    // Modify the file input event listener
    fileInput.addEventListener('change', async (event) => {
        const file = event.target.files[0];
        if (!file) return;

        // Reset state
        currentSessionId = null;
        currentPage = 1;
        zoomLevel = 100;
        
        // Show loading state
        uploadStatus.innerHTML = '<p class="text-blue-500">Processing file...</p>';
        uploadButton.disabled = true;
        uploadButton.classList.add('opacity-50');

        try {
            const formData = new FormData();
            formData.append('file', file);

            const response = await fetch('/analyze-drawing', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            
            if (data.session_id) {
                // Show PDF viewer section
                pdfViewerSection.classList.remove('hidden');
                resultsSection.classList.remove('hidden');
                
                // Update session data
                currentSessionId = data.session_id;
                
                // Display first page
                updatePDFDisplay(data.session_id);
                
                // Update dimensions display
                if (data.dimensions && data.dimensions.length > 0) {
                    resultsDisplay.innerHTML = `
                        <h3 class="font-semibold mb-2">Extracted Dimensions:</h3>
                        <ul class="list-disc pl-5">
                            ${data.dimensions.map(dim => `<li>${dim}</li>`).join('')}
                        </ul>
                    `;
                } else {
                    resultsDisplay.textContent = 'No dimensions found in the document.';
                }
                
                // Enable chat interface
                chatInput.disabled = false;
                sendButton.disabled = false;
                chatInput.dataset.sessionId = data.session_id;
                
                // Clear loading state
                uploadStatus.innerHTML = '<p class="text-green-500">File processed successfully!</p>';
                
            } else {
                throw new Error(data.message || 'Upload failed');
            }
        } catch (error) {
            console.error('Upload error:', error);
            uploadStatus.innerHTML = `<p class="text-red-500">Error: ${error.message}</p>`;
        } finally {
            // Re-enable upload button
            uploadButton.disabled = false;
            uploadButton.classList.remove('opacity-50');
        }
    });

    async function pollAnalysisStatus(sessionId, loadingDiv) {
        try {
            const response = await fetch(`/analysis-status/${sessionId}`);
            const data = await response.json();
            
            if (data.status === 'error') {
                throw new Error(data.message);
            }
            
            if (data.status === 'success') {
                // Update UI for success
                successMessage.textContent = `Analysis complete! Processed ${data.results.length} pages`;
                successMessage.classList.remove('hidden');
                errorMessage.classList.add('hidden');
                
                // Display results
                let resultsHtml = '<div class="space-y-4">';
                data.results.forEach(result => {
                    resultsHtml += `
                        <div class="border rounded p-4">
                            <h3 class="font-bold mb-2">Page ${result.page}</h3>
                            <div class="space-y-2">
                                ${result.text.map(line => `<p>${line.text}</p>`).join('')}
                            </div>
                        </div>
                    `;
                });
                resultsHtml += '</div>';
                resultsDisplay.innerHTML = resultsHtml;
                
                // Add system message to chat
                addMessageToChat('system', 'Drawing analyzed! You can now ask questions about it.');
                
                // Clean up
                if (loadingDiv && loadingDiv.parentNode) {
                    loadingDiv.parentNode.removeChild(loadingDiv);
                }
                
            } else if (data.status === 'processing') {
                // Update loading message
                loadingDiv.querySelector('p').textContent = 'Analyzing your drawing...';
                // Continue polling
                setTimeout(() => pollAnalysisStatus(sessionId, loadingDiv), 2000);
            }
        } catch (error) {
            console.error('Status check error:', error);
            errorMessage.textContent = `Error: ${error.message}`;
            errorMessage.classList.remove('hidden');
            successMessage.classList.add('hidden');
            
            // Clean up
            if (loadingDiv && loadingDiv.parentNode) {
                loadingDiv.parentNode.removeChild(loadingDiv);
            }
        }
    }

    // PDF rendering functions
    async function renderPDF(file) {
        if (!file) return;

        try {
            const reader = new FileReader();
            reader.onload = async function(e) {
                pdfBytes = new Uint8Array(e.target.result);
                pdfDoc = await pdfjsLib.getDocument({ data: pdfBytes }).promise;
                updatePageInfo();
                renderPage(currentPage);
                
                // Enable navigation buttons
                prevPageButton.disabled = currentPage <= 1;
                nextPageButton.disabled = currentPage >= pdfDoc.numPages;
            };
            reader.readAsArrayBuffer(file);
        } catch (error) {
            console.error('Error rendering PDF:', error);
        }
    }

    async function renderPage(pageNum) {
        if (!pdfDoc) return;

        // If a page rendering is in progress, wait for it to complete
        if (pageRendering) {
            renderPending = pageNum;
            return;
        }

        pageRendering = true;

        try {
            // Get page
            const page = await pdfDoc.getPage(pageNum);
            const viewport = page.getViewport({ scale: zoomLevel / 100 });

            // Clear existing content
            while (pdfContainer.firstChild) {
                pdfContainer.removeChild(pdfContainer.firstChild);
            }

            // Create a new canvas for each render
            const canvas = document.createElement('canvas');
            pdfContainer.appendChild(canvas);
            
            // Adjust canvas dimensions to match the viewport
            canvas.height = viewport.height;
            canvas.width = viewport.width;

            const context = canvas.getContext('2d');
            const renderContext = {
                canvasContext: context,
                viewport: viewport
            };

            // Render the page
            const renderTask = page.render(renderContext);
            
            // Wait for rendering to finish
            await renderTask.promise;
            
            // Rendering complete, check if there's a pending page
            pageRendering = false;
            if (renderPending !== null) {
                // New page rendering is pending
                const pendingPage = renderPending;
                renderPending = null;
                renderPage(pendingPage);
            }
        } catch (error) {
            console.error('Error rendering page:', error);
            pageRendering = false;
        }
    }

    function updatePageInfo() {
        if (pdfDoc) {
            pageInfo.textContent = `Page ${currentPage} of ${pdfDoc.numPages}`;
        }
    }

    // PDF navigation and zoom functions
    function updatePDFDisplay(sessionId) {
        if (!sessionId) {
            console.error("No session ID provided");
            return;
        }
        
        currentSession = sessionId;
        const pdfContainer = document.getElementById('pdfContainer');
        const pdfViewer = document.getElementById('pdfViewer');
        const pageInfo = document.getElementById('pageInfo');
        const prevPageBtn = document.getElementById('prevPage');
        const nextPageBtn = document.getElementById('nextPage');
        
        // Check if required elements exist
        if (!pdfContainer || !pdfViewer) {
            console.error("Required PDF display elements not found");
            return;
        }
        
        // Clear previous content
        pdfViewer.innerHTML = '';
        
        // Get session data
        fetch(`/session/${sessionId}`)
            .then(response => response.json())
            .then(data => {
                console.log('Session data:', data);
                if (data.status === 'completed') {
                    const pages = data.pages;
                    const pageCount = Object.keys(pages).length;
                    
                    // Update page info if element exists
                    if (pageInfo) {
                        pageInfo.textContent = `Page 1 of ${pageCount}`;
                    }
                    
                    // Show navigation buttons if they exist and there are multiple pages
                    if (prevPageBtn && nextPageBtn) {
                        if (pageCount > 1) {
                            prevPageBtn.style.display = 'inline-block';
                            nextPageBtn.style.display = 'inline-block';
                        } else {
                            prevPageBtn.style.display = 'none';
                            nextPageBtn.style.display = 'none';
                        }
                    }
                    
                    // Display first page
                    const firstPage = pages[1];
                    if (firstPage) {
                        if (firstPage.image_path) {
                            // Display image
                            const img = document.createElement('img');
                            img.src = firstPage.image_path;
                            img.alt = 'Page 1';
                            img.style.maxWidth = '100%';
                            img.style.height = 'auto';
                            pdfViewer.appendChild(img);
                        } else if (firstPage.file_path) {
                            // Display PDF using browser's PDF viewer
                            const embed = document.createElement('embed');
                            embed.src = firstPage.file_path;
                            embed.type = 'application/pdf';
                            embed.style.width = '100%';
                            embed.style.height = '600px';
                            pdfViewer.appendChild(embed);
                        }
                    }
                    
                    // Show the container
                    pdfContainer.style.display = 'block';
                } else if (data.status === 'processing') {
                    // Show loading state
                    pdfViewer.innerHTML = '<div class="loading">Processing file...</div>';
                    pdfContainer.style.display = 'block';
                    // Poll for updates
                    setTimeout(() => updatePDFDisplay(sessionId), 1000);
                } else if (data.status === 'error') {
                    pdfViewer.innerHTML = `<div class="error">Error: ${data.error}</div>`;
                    pdfContainer.style.display = 'block';
                }
            })
            .catch(error => {
                console.error('Error fetching session data:', error);
                pdfViewer.innerHTML = '<div class="error">Error loading file</div>';
                pdfContainer.style.display = 'block';
            });
    }

    prevPageButton.addEventListener('click', () => {
        if (currentPage > 1) {
            currentPage--;
            updatePDFDisplay(currentSession);
        }
    });

    nextPageButton.addEventListener('click', () => {
        if (currentPage < totalPages) {
            currentPage++;
            updatePDFDisplay(currentSession);
        }
    });

    zoomInButton.addEventListener('click', () => {
        if (zoomLevel < 200) {
            zoomLevel += 25;
            zoomLevelSpan.textContent = `${zoomLevel}%`;
            updatePDFDisplay(currentSession);
        }
    });

    zoomOutButton.addEventListener('click', () => {
        if (zoomLevel > 25) {
            zoomLevel -= 25;
            zoomLevelSpan.textContent = `${zoomLevel}%`;
            updatePDFDisplay(currentSession);
        }
    });

    // Chat functionality
    sendButton.addEventListener('click', handleChat);
    chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            handleChat();
        }
    });

    async function handleChat() {
        const message = chatInput.value.trim();
        if (!message) return;
        
        if (!currentSessionId) {
            addMessageToChat('error', 'Please upload a drawing first.');
            return;
        }

        // Add user message
        addMessageToChat('user', message);
        chatInput.value = '';
        
        // Show loading state
        const loadingMessage = addMessageToChat('loading', 'Processing...');
        console.log('Sending chat message:', message, 'Session:', currentSessionId);

        try {
            const response = await fetch('/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ 
                    user_input: message,
                    session_id: currentSessionId
                })
            });

            const data = await response.json();
            console.log('Chat response:', data);
            
            // Remove loading message
            if (loadingMessage && loadingMessage.parentNode) {
                loadingMessage.remove();
            }
            
            if (data.status === 'success') {
                addMessageToChat('ai', data.reply);
            } else {
                addMessageToChat('error', data.reply || 'Chat failed');
            }
        } catch (error) {
            console.error('Chat error:', error);
            if (loadingMessage && loadingMessage.parentNode) {
                loadingMessage.remove();
            }
            addMessageToChat('error', `Error: ${error.message}`);
        }
    }

    function addMessageToChat(role, message) {
        const messageDiv = document.createElement('div');
        messageDiv.classList.add('chat-message');
        
        if (role === 'user') {
            messageDiv.classList.add('user-message');
            messageDiv.textContent = message;
        } else if (role === 'ai') {
            messageDiv.classList.add('ai-message');
            messageDiv.textContent = message;
        } else if (role === 'loading') {
            messageDiv.classList.add('loading-message');
            messageDiv.textContent = 'Processing...';
        } else if (role === 'system') {
            messageDiv.classList.add('system-message');
            messageDiv.textContent = message;
        } else {
            messageDiv.classList.add('error-message');
            messageDiv.textContent = message;
        }

        chatDisplay.appendChild(messageDiv);
        chatDisplay.scrollTop = chatDisplay.scrollHeight;
        
        return messageDiv;
    }

    async function handleFileUpload(file) {
        try {
            // Show loading state
            dropZone.innerHTML = '<p class="text-gray-600">Processing file...</p>';
            
            const formData = new FormData();
            formData.append('file', file);
            
            const response = await fetch('/analyze-drawing', {
                method: 'POST',
                body: formData
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            console.log('File upload response:', data);
            
            if (data.session_id) {
                currentSessionId = data.session_id;
                
                // Show preview
                pdfContainer.classList.remove('hidden');
                if (data.page_paths && data.page_paths.length > 0) {
                    const img = document.createElement('img');
                    img.src = data.page_paths[0];
                    img.alt = 'Preview';
                    img.className = 'max-w-full h-auto';
                    pdfViewer.innerHTML = '';
                    pdfViewer.appendChild(img);
                }
                
                // Add welcome message
                addMessageToChat('system', 'Drawing uploaded! You can now ask questions about it.');
            }
            
        } catch (error) {
            console.error('Upload error:', error);
            dropZone.innerHTML = `<div class="text-red-500">Error: ${error.message}</div>`;
        }
    }
});