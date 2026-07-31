export function Modal({ title, children, onClose, width = '400px', height }) {
  return (
    <div style={{
      position: 'fixed',
      top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999
    }}>
      <div className="panel" style={{ width, maxWidth: '95%', height: height || undefined, maxHeight: '90vh', overflowY: 'auto' }}>
        <div className="panelHead" style={{
          background: 'var(--brand)',
          borderBottom: '1px solid rgba(255,255,255,0.2)',
          padding: '14px 20px',
          margin: '-20px -20px 16px',
          borderRadius: 'calc(var(--r-lg) - 1px) calc(var(--r-lg) - 1px) 0 0',
        }}>
          <h2 style={{ fontSize: '18px', margin: 0, color: '#FFFFFF' }}>{title}</h2>
          <button type="button" onClick={onClose} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '6px', fontSize: '18px', width: '28px', height: '28px', lineHeight: 1, cursor: 'pointer', color: '#FFFFFF' }}>&times;</button>
        </div>
        <div>
          {children}
        </div>
      </div>
    </div>
  );
}
