import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Pause, SkipBack, SkipForward, BrainCircuit, Search, Loader2, AlertTriangle, Wand2 } from 'lucide-react';

// --- Main App Component ---
export default function App() {
    const [algorithm, setAlgorithm] = useState('Dijkstra\'s Algorithm');
    const [inputData, setInputData] = useState('');
    const [promptArgs, setPromptArgs] = useState('');
    
    const [vizHtml, setVizHtml] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);

    const [currentStepInfo, setCurrentStepInfo] = useState({ current: 0, total: 0 });
    const [isPlaying, setIsPlaying] = useState(false);
    const [isVizReady, setIsVizReady] = useState(false);

    const iframeRef = useRef(null);
    const vizContainerRef = useRef(null);

    // --- Communication with Iframe ---
    const callIframeMethod = (method) => {
        if (iframeRef.current && iframeRef.current.contentWindow && isVizReady) {
            iframeRef.current.contentWindow[method]();
        }
    };

    const handlePlayPause = () => {
        if (!isVizReady) return;
        if (isPlaying) {
            callIframeMethod('pause');
            setIsPlaying(false);
        } else {
            // If at the end, restart
            if(currentStepInfo.current >= currentStepInfo.total -1) {
                callIframeMethod('restart');
            }
            callIframeMethod('play');
            setIsPlaying(true);
        }
    };

    const handleNext = () => {
        if (!isVizReady) return;
        setIsPlaying(false);
        callIframeMethod('pause'); // Ensure any running timer is stopped
        callIframeMethod('nextStep');
    };

    const handlePrev = () => {
        if (!isVizReady) return;
        setIsPlaying(false);
        callIframeMethod('pause');
        callIframeMethod('prevStep');
    };

    // Listen for messages (like step updates) from the iframe
    useEffect(() => {
        const handleMessage = (event) => {
            // Basic security check
            if (event.source !== iframeRef.current?.contentWindow) {
                return;
            }
            
            const { type, payload } = event.data;
            if (type === 'STEP_UPDATE') {
                setCurrentStepInfo(payload);
                if (payload.current >= payload.total - 1) {
                    setIsPlaying(false); // Stop when animation finishes
                }
            }
            if (type === 'VIZ_READY') {
                setIsVizReady(true);
                setCurrentStepInfo(payload.stepInfo);
            }
        };

        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, []);


    // --- Gemini API Call ---
    const getVisualization = async () => {
        if (!algorithm) {
            setError("Please provide an algorithm name.");
            return;
        }
        setIsLoading(true);
        setError(null);
        setVizHtml(null);
        setIsVizReady(false);
        setCurrentStepInfo({ current: 0, total: 0 });
        setIsPlaying(false);

        const prompt = `
You are an expert D3.js and algorithm visualization developer. Your task is to generate a complete, self-contained HTML document that visualizes a given algorithm, making it exceptionally user-friendly and robust.

**Algorithm:** ${algorithm}
**User-provided Input Data:** ${inputData || 'Not provided'}
**User-provided Additional Arguments:** ${promptArgs || 'Not provided'}

**INTELLIGENT DATA HANDLING:**
1.  **If user provides valid data and arguments:** Use them directly.
2.  **If user data is missing, incomplete, or invalid for the algorithm:** You MUST generate a classic, simple, and clear example dataset.
3.  **Acknowledge Generated Data:** If you generate data, you MUST add a note in the explanation of the *first step* saying so. E.g., "Step 1: Initial state. A sample array was generated as no input was provided."

**Your output MUST be a single, complete HTML file and nothing else.** This file must not have any external dependencies except for the D3.js library, which you MUST include from the CDN: <script src="https://d3js.org/d3.v7.min.js"></script>.

**CRITICAL REQUIREMENTS for the generated HTML:**

1.  **Structure:** A standard HTML5 document. The body should have a dark background (\`#111827\`) and light text.
2.  **Layout:**
    * Create a main container for the visualization SVG.
    * Create a separate \`div\` with \`id="explanation-box"\` for the step-by-step text. It should be styled to be highly readable.
    * **Visual Timer:** You MUST create an SVG element with \`id="timer-svg"\` next to the explanation text. This SVG will contain a circle that acts as a progress bar for the automatic playback.
3.  **Visualization:** Use an SVG element for the D3 visualization. It must be centered, responsive, and resize with the window.
4.  **Styling:** All CSS must be inside a \`<style>\` tag. Use modern styling (flexbox, clean fonts, etc.).
5.  **JavaScript Logic:** All JavaScript MUST be inside a single \`<script>\` tag.
6.  **Step-by-Step Data:** Your script must generate a series of "steps" as a JavaScript array (\`const steps = [...]\`). Each object must contain the state for that step AND an \`explanation\` string.
7.  **Communication with Parent:** The script MUST communicate with the parent window using \`window.parent.postMessage\`.
    * On load: \`window.parent.postMessage({ type: 'VIZ_READY', payload: { stepInfo: { current: 0, total: steps.length } } }, '*');\`
    * On step change: \`window.parent.postMessage({ type: 'STEP_UPDATE', payload: { current: currentStep, total: steps.length, explanation: steps[currentStep].explanation } }, '*');\`
8.  **Control Functions:** You MUST expose these global functions:
    * \`play()\`: Starts/resumes the animation. It MUST use a **3-second delay** between steps. It will control the visual timer animation.
    * \`pause()\`: Pauses the animation and the visual timer.
    * \`nextStep()\`: Manually advances to the next step. Must reset the timer.
    * \`prevStep()\`: Manually goes to the previous step. Must reset the timer.
    * \`restart()\`: Resets the visualization to the first step.
    * \`updateVisualization(stepIndex)\`: Core function to render the visualization for a given \`stepIndex\`.
9.  **Timer Logic & Scope:**
    * **Declare \`timerTransition\` in the global scope** of the script (e.g., \`let timerTransition;\`). This variable will hold the active D3 timer transition.
    * The \`play()\` function should assign the new D3 transition to this global \`timerTransition\` variable.
    * The \`pause()\` function must robustly stop the animation. It should check if \`timerTransition\` exists, and then wrap the interrupt call in a try-catch block to prevent errors from finished transitions. After interrupting, it must set \`timerTransition = null;\`. Example: \`if (timerTransition) { try { timerTransition.interrupt(); } catch(e) {} timerTransition = null; }\`
    * The \`.on("end", ...)\` callback for the timer transition in the \`play()\` function must also set \`timerTransition = null;\` before it calls \`nextStep()\`.
    * This robust approach ensures that \`.interrupt()\` is never called on a stale or completed transition object.

Generate the complete HTML code now. Do not include any markdown formatting like \`\`\`html.
`;

        try {
            const apiKey = ""; // Your Gemini API key
            const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`;
            const payload = { contents: [{ parts: [{ text: prompt }] }] };

            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => response.text());
                const errorDetails = typeof errorData === 'object' ? JSON.stringify(errorData) : errorData;
                throw new Error(`API Error: ${response.status} ${response.statusText}. Details: ${errorDetails}`);
            }

            const result = await response.json();
            const text = result.candidates[0].content.parts[0].text;
            
            const cleanHtml = text.trim().replace(/^```html\s*|```$/g, '');
            setVizHtml(cleanHtml);

        } catch (e) {
            console.error(e);
            setError(e.message || "Failed to generate visualization. An unknown error occurred.");
        } finally {
            setIsLoading(false);
        }
    };
    
    const handleGenerateClick = (e) => {
        e.preventDefault();
        getVisualization();
    };

    const explanationText = vizHtml && isVizReady ? `Step ${currentStepInfo.current + 1} of ${currentStepInfo.total}` : 'Waiting for visualization...';

    return (
        <div className="flex flex-col lg:flex-row w-full min-h-screen bg-gray-100 font-sans text-gray-800 p-4 lg:p-6 gap-6">
            {/* --- Left Panel: Controls & Info --- */}
            <div className="lg:w-1/3 xl:w-1/4 flex flex-col gap-6">
                <div className="bg-white p-5 rounded-lg border border-gray-200 shadow-sm">
                    <div className="flex items-center gap-3 mb-4">
                        <BrainCircuit className="w-8 h-8 text-indigo-600" />
                        <h1 className="text-2xl font-bold text-gray-800">Algo Lab</h1>
                    </div>
                    <p className="text-sm text-gray-600 mb-4"></p>
                   
                    
                    <form onSubmit={handleGenerateClick} className="space-y-4">
                        <div>
                            <label htmlFor="algorithm" className="block text-sm font-medium text-gray-700 mb-1">Algorithm</label>
                            <input type="text" id="algorithm" value={algorithm} onChange={(e) => setAlgorithm(e.target.value)} className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500" placeholder="e.g., A* Search" />
                        </div>
                        <div>
                            <label htmlFor="inputData" className="block text-sm font-medium text-gray-700 mb-1">Input Data (Optional)</label>
                            <textarea id="inputData" value={inputData} onChange={(e) => setInputData(e.target.value)} className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500" rows="4" placeholder="e.g., a graph, a grid, or an array." />
                        </div>
                         <div>
                            <label htmlFor="promptArgs" className="block text-sm font-medium text-gray-700 mb-1">Additional Arguments (Optional)</label>
                            <input type="text" id="promptArgs" value={promptArgs} onChange={(e) => setPromptArgs(e.target.value)} className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500" placeholder="e.g., Start Node, End Node" />
                        </div>
                        <button type="submit" disabled={isLoading} className="w-full flex items-center justify-center gap-2 px-4 py-2.5 font-semibold text-white bg-indigo-600 rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:bg-indigo-300 disabled:cursor-not-allowed transition-all">
                            {isLoading ? <Loader2 className="animate-spin" /> : <Wand2 />}
                            {isLoading ? 'Generating...' : 'Visualize'}
                        </button>
                    </form>
                </div>

                {/* --- Controls --- */}
                {vizHtml && (
                     <div className="bg-white p-5 rounded-lg border border-gray-200 shadow-sm flex-grow flex flex-col">
                        <h2 className="text-lg font-bold text-gray-800 mb-2">Controls</h2>
                        <p className="text-sm text-gray-600 mb-4 pb-4 border-b border-gray-200">{explanationText}</p>
                        
                        <div className="flex-grow"></div>
                        
                        <div className="mt-auto pt-4">
                            <div className="w-full bg-gray-200 rounded-full h-2.5 mb-4">
                                <div className="bg-indigo-600 h-2.5 rounded-full" style={{ width: `${currentStepInfo.total > 0 ? ((currentStepInfo.current + 1) / currentStepInfo.total) * 100 : 0}%`, transition: 'width 0.3s ease-in-out' }}></div>
                            </div>
                            <div className="flex items-center justify-center gap-4">
                                <button onClick={handlePrev} disabled={!isVizReady || currentStepInfo.current === 0} title="Previous Step" className="p-3 rounded-full bg-gray-200 text-gray-700 hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed transition-transform duration-150 ease-in-out hover:scale-110 active:scale-100">
                                    <SkipBack />
                                </button>
                                <button onClick={handlePlayPause} disabled={!isVizReady} title="Play/Pause" className="p-4 rounded-full bg-indigo-600 text-white hover:bg-indigo-700 text-2xl w-16 h-16 flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed transition-transform duration-150 ease-in-out hover:scale-110 active:scale-100">
                                    {isPlaying ? <Pause /> : <Play />}
                                </button>
                                <button onClick={handleNext} disabled={!isVizReady || currentStepInfo.current >= currentStepInfo.total - 1} title="Next Step" className="p-3 rounded-full bg-gray-200 text-gray-700 hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed transition-transform duration-150 ease-in-out hover:scale-110 active:scale-100">
                                    <SkipForward />
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* --- Right Panel: Visualization --- */}
            <div className="flex-grow lg:w-2/3 xl:w-3/4 bg-gray-900 rounded-lg shadow-inner" ref={vizContainerRef}>
                {isLoading && (
                    <div className="w-full h-full flex flex-col items-center justify-center bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
                        <Loader2 className="w-12 h-12 text-indigo-500 animate-spin mb-4" />
                        <p className="text-lg font-semibold text-gray-600">Generating Custom Visualization...</p>
                        <p className="text-sm text-gray-500">The AI is building a D3.js visualization for you.</p>
                    </div>
                )}
                {error && (
                    <div className="w-full h-full flex flex-col items-center justify-center bg-red-50 rounded-lg border-2 border-dashed border-red-300 p-4">
                        <AlertTriangle className="w-12 h-12 text-red-500 mb-4" />
                        <p className="text-lg font-semibold text-red-700">An Error Occurred</p>
                        <p className="text-sm text-red-600 text-center">{error}</p>
                    </div>
                )}
                {!isLoading && !error && !vizHtml && (
                     <div className="w-full h-full flex flex-col items-center justify-center bg-gray-50 rounded-lg border-2 border-dashed border-gray-300 p-4">
                        <Search className="w-12 h-12 text-gray-400 mb-4" />
                        <p className="text-lg font-semibold text-gray-600">Ready to Visualize</p>
                        <p className="text-sm text-gray-500 text-center">Describe an algorithm on the left to generate a custom animation.</p>
                    </div>
                )}
                {vizHtml && (
                    <iframe
                        ref={iframeRef}
                        srcDoc={vizHtml}
                        title="Algorithm Visualization"
                        className="w-full h-full border-0 rounded-lg"
                        sandbox="allow-scripts allow-same-origin"
                        onLoad={() => console.log("Iframe loaded. Waiting for VIZ_READY message...")}
                    />
                )}
            </div>
        </div>
    );
}
