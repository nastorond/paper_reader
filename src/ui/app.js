let pdfDoc = null;
let highlights = [];
let lastPapersJson = "";
let initialLoadDone = false;
let currentSelectionData = null;
let globalReferences = [];
let historyStack = [];
let currentFilePath = null;

// Global function for cross-paper linking
async function openPdf(filepath, isGoBack = false) {
    if (window.pywebview) {
        try {
            if (!isGoBack && currentFilePath && currentFilePath !== filepath) {
                historyStack.push(currentFilePath);
            }
            const res = await window.pywebview.api.open_specific_pdf(filepath);

            // On success, update current path and back button visibility
            if (res && res.success) {
                currentFilePath = filepath;
                updateBackButton();
            }

            handlePdfLoaded(res);
            // close tooltip if open
            document.getElementById('citation-tooltip').style.display = 'none';
        } catch (err) {
            console.error(err);
        }
    }
}

function updateBackButton() {
    const backBtn = document.getElementById('back-btn');
    if (historyStack.length > 0) {
        backBtn.style.display = 'block';
    } else {
        backBtn.style.display = 'none';
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    const openBtn = document.getElementById('open-btn');
    const placeholderMsg = document.getElementById('placeholder-msg');

    // Fetch local papers on startup and set polling
    if (window.pywebview) {
        await loadLocalPapers();
        setInterval(loadLocalPapers, 2000);
    } else {
        window.addEventListener('pywebviewready', async () => {
            await loadLocalPapers();
            setInterval(loadLocalPapers, 2000);
        });
    }

    // Open PDF
    openBtn.addEventListener('click', async () => {
        if (window.pywebview) {
            try {
                const response = await window.pywebview.api.open_pdf();
                if (response && response.success) {
                    if (currentFilePath) historyStack.push(currentFilePath);
                    currentFilePath = response.filepath;
                    updateBackButton();
                }
                handlePdfLoaded(response);
            } catch (err) {
                console.error("API call failed:", err);
            }
        } else {
            alert('PyWebView is not loaded!');
        }
    });

    const backBtn = document.getElementById('back-btn');
    backBtn.addEventListener('click', () => {
        if (historyStack.length > 0) {
            const prevPath = historyStack.pop();
            updateBackButton();
            openPdf(prevPath, true); // true = isGoBack
        }
    });

    // Text Selection Logic for Floating Action Bar
    document.addEventListener('selectionchange', () => {
        const selection = window.getSelection();
        if (selection.toString().trim() === '') {
            document.getElementById('action-bar').style.display = 'none';
            currentSelectionData = null;
        }
    });

    document.getElementById('pages-container').addEventListener('mouseup', (e) => {
        setTimeout(() => {
            const selection = window.getSelection();
            const text = selection.toString().trim();

            if (text.length > 0) {
                const range = selection.getRangeAt(0);
                const rect = range.getBoundingClientRect();

                // Find which page this text belongs to
                const pageWrapper = window.getSelection().anchorNode.parentElement.closest('.pdf-page-wrapper');
                if (!pageWrapper) return;

                const pageNum = parseInt(pageWrapper.dataset.pageNum);
                const wrapperRect = pageWrapper.getBoundingClientRect();

                currentSelectionData = {
                    text: text,
                    pageNum: pageNum,
                    pageWrapper: pageWrapper,
                    rectRelative: {
                        top: rect.top - wrapperRect.top,
                        left: rect.left - wrapperRect.left,
                        width: rect.width,
                        height: rect.height
                    }
                };

                // Show action bar
                const actionBar = document.getElementById('action-bar');
                actionBar.style.display = 'flex';
                // Position above the selection
                actionBar.style.top = `${rect.top + window.scrollY}px`;
                actionBar.style.left = `${rect.left + (rect.width / 2)}px`;
            }
        }, 10);
    });

    // Action Bar Buttons
    document.getElementById('btn-cancel').addEventListener('click', () => {
        window.getSelection().removeAllRanges();
        document.getElementById('action-bar').style.display = 'none';
        currentSelectionData = null;
    });

    document.getElementById('btn-highlight').addEventListener('click', async () => {
        if (!currentSelectionData) return;

        const highlightData = {
            text: currentSelectionData.text,
            page: currentSelectionData.pageNum,
            rect: currentSelectionData.rectRelative,
            color: "rgba(250, 204, 21, 0.4)",
            timestamp: new Date().toISOString()
        };

        // Optimistic UI updates
        highlights.push(highlightData);
        drawHighlight(highlightData, currentSelectionData.pageWrapper);
        renderMemoList();

        if (window.pywebview) {
            await window.pywebview.api.save_highlight(highlightData);
            loadLocalPapers(); // update memo count display
        }

        window.getSelection().removeAllRanges();
        document.getElementById('action-bar').style.display = 'none';
        currentSelectionData = null;
    });

    // Citation Click Listener (Scroll right sidebar)
    document.getElementById('pages-container').addEventListener('click', (e) => {
        if (e.target.tagName !== 'SPAN') return;
        const textLayer = e.target.closest('.textLayer');
        if (!textLayer) return;

        const text = e.target.innerText.trim();
        const match = text.match(/^\[\s*(\d+)\s*\]$/);

        if (match) {
            const refIndex = parseInt(match[1]) - 1;
            if (refIndex >= 0 && refIndex < globalReferences.length) {
                // Scroll the right sidebar to this reference
                const list = document.getElementById('ref-list');
                const li = list.children[refIndex];
                if (li) {
                    li.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    // Flash highlight
                    const originalBg = li.style.backgroundColor;
                    li.style.backgroundColor = '#fef08a'; // yellow highlight
                    li.style.transition = 'background-color 0.3s';
                    setTimeout(() => {
                        li.style.backgroundColor = originalBg;
                        setTimeout(() => {
                            li.style.transition = '';
                        }, 300);
                    }, 2000);
                }
            }
        }
    });
});

async function loadLocalPapers() {
    try {
        const response = await window.pywebview.api.get_local_papers();
        if (response && response.success) {
            const currentPapersJson = JSON.stringify(response.papers);
            if (currentPapersJson === lastPapersJson) return;
            lastPapersJson = currentPapersJson;

            const list = document.getElementById('papers-list');
            list.innerHTML = '';

            if (response.papers.length === 0) {
                list.innerHTML = '<li class="empty-state">No PDFs in "papers/" folder.</li>';
                return;
            }

            let firstPaperPath = null;

            response.papers.forEach((p, idx) => {
                const li = document.createElement('li');
                // Display rich metadata
                const titleHtml = p.title !== p.filename ? `<strong>${p.title}</strong><br>` : `<strong>${p.filename}</strong><br>`;
                const authorHtml = p.authors ? `<span style="font-size: 0.75rem; color: #64748b">${p.authors} ${p.year ? `(${p.year})` : ''}</span><br>` : '';

                // Connection badge based on network
                let badgesHtml = '';
                if (p.cites_count > 0 || p.cited_by_count > 0) {
                    badgesHtml = `<span style="font-size: 0.7rem; background: #e0f2fe; color: #0284c7; padding: 2px 4px; border-radius: 4px; margin-right: 4px;">🔗 ${p.cites_count + p.cited_by_count} Links</span>`;
                }
                if (p.memos_count > 0) {
                    badgesHtml += `<span style="font-size: 0.7rem; background: #fef08a; color: #854d0e; padding: 2px 4px; border-radius: 4px;">📝 ${p.memos_count} Memos</span>`;
                }

                li.innerHTML = `${titleHtml}${authorHtml}<div style="margin-top:4px;">${badgesHtml}</div>`;

                li.addEventListener('click', () => {
                    openPdf(p.filepath); // Routes through our history-aware method
                });

                list.appendChild(li);

                if (idx === 0) {
                    firstPaperPath = p.filepath;
                }
            });

            // Automatically open the first paper ONCE
            if (!initialLoadDone && firstPaperPath) {
                initialLoadDone = true;
                openPdf(firstPaperPath);
            }
        }
    } catch (e) {
        console.error("Failed to load local papers", e);
    }
}

async function handlePdfLoaded(response) {
    if (response && response.success) {
        document.getElementById('placeholder-msg').style.display = 'none';

        // Clear previous state and container
        highlights = response.sidecar?.highlights || [];
        globalReferences = response.references || [];
        const indexData = response.index_data || {};

        const container = document.getElementById('pages-container');
        container.innerHTML = '';

        renderMemoList();
        renderReferences(globalReferences);
        renderNetworkLinks(indexData);

        const binaryString = atob(response.data);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }

        const loadingTask = pdfjsLib.getDocument({ data: bytes });
        pdfDoc = await loadingTask.promise;

        // Render all pages for continuous scrolling
        // Rendering sequentially to avoid blocking the main thread too hard
        for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
            await renderPage(pageNum);
        }

    } else if (response && response.error) {
        if (response.error !== "No file selected") {
            alert("Error: " + response.error);
        }
    }
}

function renderReferences(refs) {
    const sidebar = document.getElementById('right-sidebar');
    const list = document.getElementById('ref-list');
    list.innerHTML = '';

    if (refs.length === 0) {
        sidebar.style.display = 'none';
        return;
    }

    sidebar.style.display = 'flex';

    refs.forEach((r, index) => {
        const li = document.createElement('li');
        li.style.cursor = 'pointer';
        li.innerHTML = `<strong style="color: var(--accent);">[${index + 1}]</strong> ${r.text}`;

        if (r.local_path) {
            li.style.borderLeft = '3px solid #10b981';
            li.style.paddingLeft = '8px';
            li.style.backgroundColor = '#ecfdf5';

            const btn = document.createElement('button');
            btn.innerHTML = '🔗 로컬 논문 열기 (Available Locally)';
            btn.className = 'action-btn';
            btn.style.display = 'block';
            btn.style.marginTop = '6px';
            btn.style.padding = '4px 8px';
            btn.style.fontSize = '0.75rem';
            btn.style.backgroundColor = '#10b981';
            btn.addEventListener('click', (e) => {
                e.stopPropagation(); // prevent triggering the span search
                openPdf(r.local_path);
            });
            li.appendChild(btn);
        }

        // Clicking the reference in the sidebar searches for it in the text
        li.addEventListener('click', () => {
            const searchText = `[${index + 1}]`;
            let found = false;

            const highlightSpan = (span) => {
                // Scroll the container to the span Element
                span.scrollIntoView({ behavior: 'smooth', block: 'center' });

                const originalBg = span.style.backgroundColor;
                span.style.backgroundColor = 'rgba(250, 204, 21, 0.8)';
                span.style.borderRadius = '3px';
                span.style.color = '#000'; // Make text temporarily visible
                span.style.padding = '0 2px';

                setTimeout(() => {
                    span.style.backgroundColor = originalBg;
                    span.style.color = 'transparent';
                    span.style.padding = '0';
                }, 2000);
            };

            const spans = document.querySelectorAll('.textLayer span');

            // First pass: exact match
            for (let span of spans) {
                if (span.innerText.trim() === searchText) {
                    highlightSpan(span);
                    found = true;
                    break;
                }
            }

            // Second pass: remove spaces matching
            if (!found) {
                for (let span of spans) {
                    // removing inner spaces to match e.g. "[ 1 ]" -> "[1]"
                    if (span.innerText.replace(/\s+/g, '') === searchText) {
                        highlightSpan(span);
                        found = true;
                        break;
                    }
                }
            }

            // Third pass: just the number
            if (!found) {
                const justNum = `${index + 1}`;
                for (let span of spans) {
                    if (span.innerText.trim() === justNum || span.innerText.trim() === `[${justNum}`) {
                        highlightSpan(span);
                        found = true;
                        break;
                    }
                }
            }

            if (!found) {
                console.log("Could not find citation reference in text layer:", searchText);
            }
        });

        list.appendChild(li);
    });
}

function renderNetworkLinks(indexData) {
    const container = document.getElementById('network-container');
    const citesList = document.getElementById('cites-list');
    const citedByList = document.getElementById('cited-by-list');

    citesList.innerHTML = '';
    citedByList.innerHTML = '';

    const cites = indexData.cites || [];
    const citedBy = indexData.cited_by || [];

    if (cites.length === 0 && citedBy.length === 0) {
        container.style.display = 'none';
        return;
    }

    container.style.display = 'block';

    // Abstracted helper to render list items
    const renderItems = (items, targetUl) => {
        if (items.length === 0) {
            targetUl.innerHTML = '<li class="empty-state">없음</li>';
            return;
        }

        items.forEach(filename => {
            const li = document.createElement('li');
            li.style.marginBottom = '6px';

            // Try to find full data in lastPapersJson
            let title = filename;
            let filepath = filename;
            try {
                if (lastPapersJson) {
                    const allPapers = JSON.parse(lastPapersJson);
                    const match = allPapers.find(p => p.filename === filename);
                    if (match) {
                        title = match.title;
                        filepath = match.filepath;
                    }
                }
            } catch (e) { }

            li.innerHTML = `<button class="action-btn" style="width: 100%; text-align: left; padding: 6px; font-size: 0.8rem; background: #f8fafc; color: var(--text-color); border: 1px solid #e2e8f0;">📑 ${title}</button>`;
            li.addEventListener('click', () => openPdf(filepath));
            targetUl.appendChild(li);
        });
    };

    renderItems(cites, citesList);
    renderItems(citedBy, citedByList);
}

async function renderPage(num) {
    if (!pdfDoc) return;

    const page = await pdfDoc.getPage(num);

    const wrapper = document.createElement('div');
    wrapper.className = 'pdf-page-wrapper';
    wrapper.dataset.pageNum = num;

    const canvas = document.createElement('canvas');
    const textLayerDiv = document.createElement('div');
    textLayerDiv.className = 'textLayer';

    wrapper.appendChild(canvas);
    wrapper.appendChild(textLayerDiv);
    document.getElementById('pages-container').appendChild(wrapper);

    const ctx = canvas.getContext('2d');

    // Calculate scale to fit viewport width gracefully
    const parentWidth = document.getElementById('pdf-container').clientWidth;
    const unscaledViewport = page.getViewport({ scale: 1.0 });
    const scale = Math.min(parentWidth / unscaledViewport.width, 1.5);
    const viewport = page.getViewport({ scale: scale });

    canvas.height = viewport.height;
    canvas.width = viewport.width;
    textLayerDiv.style.width = `${viewport.width}px`;
    textLayerDiv.style.height = `${viewport.height}px`;
    wrapper.style.width = `${viewport.width}px`;
    wrapper.style.height = `${viewport.height}px`;

    const renderContext = {
        canvasContext: ctx,
        viewport: viewport
    };

    await page.render(renderContext).promise;

    // Render text layer
    const textContent = await page.getTextContent();
    await pdfjsLib.renderTextLayer({
        textContentSource: textContent,
        container: textLayerDiv,
        viewport: viewport,
        textDivs: []
    }).promise;

    // Draw existing highlights for this specific page
    highlights.forEach(h => {
        if (h.page === num) {
            drawHighlight(h, wrapper);
        }
    });
}

function drawHighlight(h, wrapperElement) {
    if (!wrapperElement) {
        wrapperElement = document.querySelector(`.pdf-page-wrapper[data-page-num="${h.page}"]`);
    }
    if (!wrapperElement) return;

    const div = document.createElement('div');
    div.className = 'highlight-box';
    div.dataset.timestamp = h.timestamp;
    div.style.position = 'absolute';
    div.style.top = `${h.rect.top}px`;
    div.style.left = `${h.rect.left}px`;
    div.style.width = `${h.rect.width}px`;
    div.style.height = `${h.rect.height}px`;
    div.style.backgroundColor = h.color;
    div.style.pointerEvents = 'none'; // pass clicks to textLayer
    div.style.zIndex = '1';

    wrapperElement.appendChild(div);
}

function renderMemoList() {
    const list = document.getElementById('memo-list');
    list.innerHTML = '';

    if (highlights.length === 0) {
        list.innerHTML = '<li class="empty-state">No memos yet. Open a PDF to start!</li>';
        return;
    }

    highlights.forEach((h, index) => {
        const li = document.createElement('li');
        li.style.position = 'relative';

        const text = document.createElement('div');
        text.style.fontStyle = 'italic';
        text.style.marginBottom = '6px';
        text.style.paddingRight = '24px';
        text.innerText = `"${h.text.substring(0, 50)}${h.text.length > 50 ? '...' : ''}"`;

        const meta = document.createElement('div');
        meta.style.fontSize = '0.75rem';
        meta.style.color = 'var(--text-secondary)';
        meta.innerText = `Page ${h.page}`;

        const delBtn = document.createElement('button');
        delBtn.innerHTML = '×';
        delBtn.style.position = 'absolute';
        delBtn.style.top = '10px';
        delBtn.style.right = '5px';
        delBtn.style.background = 'none';
        delBtn.style.border = 'none';
        delBtn.style.color = '#ef4444';
        delBtn.style.cursor = 'pointer';
        delBtn.style.fontSize = '1.2rem';
        delBtn.style.fontWeight = 'bold';

        delBtn.addEventListener('click', async () => {
            if (window.pywebview) {
                const res = await window.pywebview.api.delete_highlight(h.timestamp);
                if (res && res.success) {
                    highlights.splice(index, 1);
                    renderMemoList(); // Sidebar update

                    // Remove highlight DOM box efficiently without re-rendering the whole page
                    const box = document.querySelector(`.highlight-box[data-timestamp="${h.timestamp}"]`);
                    if (box) box.remove();

                    loadLocalPapers(); // File list update
                } else {
                    console.error("Failed to delete memo");
                }
            }
        });

        li.appendChild(text);
        li.appendChild(meta);
        li.appendChild(delBtn);

        // Clicking a memo ideally scrolls to the page (optional enhancement)
        li.addEventListener('dblclick', () => {
            const pageDiv = document.querySelector(`.pdf-page-wrapper[data-page-num="${h.page}"]`);
            if (pageDiv) pageDiv.scrollIntoView({ behavior: 'smooth' });
        });

        list.appendChild(li);
    });
}
