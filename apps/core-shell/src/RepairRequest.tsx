import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { CircleAlert, Loader2, Pencil, Square, Undo2, X } from 'lucide-react';
import html2canvas from 'html2canvas-pro';
import './RepairRequest.css';

type Point = { x: number; y: number };
type Mark = { tool: 'pen' | 'rectangle'; points: Point[] };
type Capture = { image: string; page: string; module: string; capturedAt: string };

function drawMark(context: CanvasRenderingContext2D, mark: Mark) {
  const start = mark.points[0];
  if (!start) return;
  context.strokeStyle = '#ef2626';
  context.lineWidth = 4;
  context.lineCap = 'round';
  context.lineJoin = 'round';
  if (mark.tool === 'rectangle') {
    const end = mark.points[mark.points.length - 1];
    context.strokeRect(start.x, start.y, end.x - start.x, end.y - start.y);
  } else {
    context.beginPath();
    context.moveTo(start.x, start.y);
    if (mark.points.length === 1) context.lineTo(start.x + 0.1, start.y + 0.1);
    mark.points.slice(1).forEach((point) => context.lineTo(point.x, point.y));
    context.stroke();
  }
}

export function RepairRequest({ moduleName }: { moduleName: string }) {
  const [capture, setCapture] = useState<Capture | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [comment, setComment] = useState('');
  const [marks, setMarks] = useState<Mark[]>([]);
  const [tool, setTool] = useState<Mark['tool']>('pen');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [ready, setReady] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  const busy = useRef(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const baseImage = useRef<HTMLImageElement | null>(null);
  const stroke = useRef<Mark | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  const redraw = (currentMarks: Mark[] = marks, activeMark = stroke.current) => {
    const target = canvas.current;
    const image = baseImage.current;
    const context = target?.getContext('2d');
    if (!target || !image || !context) return;
    context.clearRect(0, 0, target.width, target.height);
    context.drawImage(image, 0, 0, target.width, target.height);
    currentMarks.forEach((mark) => drawMark(context, mark));
    if (activeMark) drawMark(context, activeMark);
  };

  useEffect(() => {
    if (!capture) return;
    dialog.current?.showModal();
    const image = new Image();
    let cancelled = false;
    image.onload = () => {
      if (cancelled || !canvas.current) return;
      baseImage.current = image;
      canvas.current.width = image.naturalWidth;
      canvas.current.height = image.naturalHeight;
      const context = canvas.current.getContext('2d');
      context?.drawImage(image, 0, 0);
      setReady(true);
    };
    image.onerror = () => { if (!cancelled) setError('Slike ni mogoče prikazati. Zapri okno in poskusi znova.'); };
    image.src = capture.image;
    return () => { cancelled = true; baseImage.current = null; };
  }, [capture]);

  useEffect(() => { redraw(); }, [marks]);

  const close = () => {
    if (sending) return;
    dialog.current?.close();
    setCapture(null);
    stroke.current = null;
    trigger.current?.focus();
  };

  const captureScreen = async () => {
    if (busy.current || capture) return;
    busy.current = true;
    setNotice('');
    setError('');
    try {
      // Start cloning before changing the UI or opening the request dialog.
      const source = html2canvas(document.documentElement, {
        width: window.innerWidth,
        height: window.innerHeight,
        x: window.scrollX,
        y: window.scrollY,
        scale: Math.min(1, 1600 / Math.max(window.innerWidth, window.innerHeight)),
        useCORS: true,
        logging: false,
        ignoreElements: (node) => node.hasAttribute('data-repair-request-ui'),
      });
      const context = { page: window.location.href, module: moduleName, capturedAt: new Date().toISOString() };
      setCapturing(true);
      const screenshot = await source;
      setComment('');
      setMarks([]);
      setReady(false);
      setTool('pen');
      setZoomed(false);
      setCapture({ ...context, image: screenshot.toDataURL('image/jpeg', 0.92) });
    } catch {
      setNotice('Zajem zaslona ni uspel. Ponovno pritisni ikono za zahtevek.');
    } finally {
      setCapturing(false);
      busy.current = false;
    }
  };

  const point = (event: PointerEvent<HTMLCanvasElement>): Point => {
    const target = event.currentTarget;
    const rect = target.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(target.width, (event.clientX - rect.left) * target.width / rect.width)),
      y: Math.max(0, Math.min(target.height, (event.clientY - rect.top) * target.height / rect.height)),
    };
  };
  const finishMark = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!stroke.current) return;
    stroke.current.points.push(point(event));
    const completed = stroke.current;
    stroke.current = null;
    setMarks((previous) => [...previous, completed]);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const send = async () => {
    if (!capture || !canvas.current || !comment.trim() || sending || !ready) return;
    setSending(true);
    setError('');
    try {
      const response = await fetch('/api/repair-requests', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comment: comment.trim(), screenshot: canvas.current.toDataURL('image/jpeg', 0.92),
          page: capture.page, module: capture.module, capturedAt: capture.capturedAt }),
      });
      const result = await response.json();
      if (!response.ok || result.success === false) throw new Error((typeof result.error === 'string' ? result.error : result.error?.message) || result.message || 'Pošiljanje zahtevka ni uspelo.');
      dialog.current?.close();
      setCapture(null);
      setNotice('Zahtevek za popravek je poslan administratorju.');
      trigger.current?.focus();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Pošiljanje zahtevka ni uspelo. Poskusi znova.');
    } finally { setSending(false); }
  };

  return <>
    <button ref={trigger} type="button" className="repair-request-trigger" data-repair-request-ui
      aria-label="Zahtevek za popravek" title="Zahtevek za popravek" disabled={capturing} onClick={captureScreen}>
      {capturing ? <Loader2 size={22} className="repair-request-spin" /> : <CircleAlert size={22} />}
    </button>
    {notice ? <div className="repair-request-notice" role="status" data-repair-request-ui>
      {notice}<button type="button" aria-label="Zapri obvestilo" onClick={() => setNotice('')}><X size={16} /></button>
    </div> : null}
    {capture ? createPortal(<dialog ref={dialog} className="repair-request-dialog" aria-labelledby="repair-request-title"
      data-repair-request-ui onCancel={(event) => { event.preventDefault(); close(); }}>
      <header><h2 id="repair-request-title">Zahtevek za popravek</h2>
        <button type="button" aria-label="Zapri" disabled={sending} onClick={close}><X size={22} /></button></header>
      <p>Na sliki označi mesto popravka in spodaj opiši težavo ali predlog izboljšave.</p>
      <div className="repair-request-tools">
        <button type="button" aria-pressed={tool === 'pen'} disabled={sending} onClick={() => setTool('pen')}><Pencil size={16} /> Pisalo</button>
        <button type="button" aria-pressed={tool === 'rectangle'} disabled={sending} onClick={() => setTool('rectangle')}><Square size={16} /> Okvir</button>
        <button type="button" disabled={!marks.length || sending} onClick={() => setMarks((previous) => previous.slice(0, -1))}><Undo2 size={16} /> Razveljavi</button>
        <button type="button" disabled={!marks.length || sending} onClick={() => setMarks([])}>Počisti oznake</button>
        <button type="button" disabled={sending} onClick={() => setZoomed((previous) => !previous)}>{zoomed ? 'Prilagodi sliko' : 'Povečaj sliko'}</button>
      </div>
      <div className="repair-request-preview" data-zoomed={zoomed}><canvas ref={canvas} aria-label="Slika aplikacije; označi s pisalom ali okvirjem"
        onPointerDown={(event) => {
          if (sending || !ready || stroke.current || (event.pointerType === 'mouse' && event.button !== 0)) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          stroke.current = { tool, points: [point(event)] };
          redraw();
        }}
        onPointerMove={(event) => { if (stroke.current) { stroke.current.points.push(point(event)); redraw(); } }}
        onPointerUp={finishMark} onPointerCancel={() => { stroke.current = null; redraw(); }} /></div>
      <label htmlFor="repair-request-comment">Komentar za popravek</label>
      <textarea id="repair-request-comment" rows={4} maxLength={5000} value={comment} disabled={sending}
        placeholder="Kaj ne deluje oziroma kaj bi želel izboljšati?" onChange={(event) => setComment(event.target.value)} />
      {error ? <p className="repair-request-error" role="alert">{error}</p> : null}
      <footer><button type="button" disabled={sending} onClick={close}>Prekliči</button>
        <button type="button" className="repair-request-send" disabled={sending || !ready || !comment.trim()} onClick={send}>
          {sending ? 'Pošiljam...' : 'Pošlji administratorju'}</button></footer>
    </dialog>, document.body) : null}
  </>;
}
