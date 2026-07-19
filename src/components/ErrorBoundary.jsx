import { Component } from "react";

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("[ErrorBoundary]", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          padding: '40px 20px',
          textAlign: 'center',
          color: 'var(--red)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '12px',
        }}>
          <div style={{fontSize:'2rem'}}>⚠️</div>
          <h2 style={{margin:0,fontSize:'1.1rem',color:'var(--ink)'}}>Algo salió mal</h2>
          <p style={{margin:0,fontSize:'0.85rem',color:'var(--muted)',maxWidth:'400px'}}>
            {this.props.message || "Ocurrió un error inesperado. Intenta recargar la página."}
          </p>
          <button
            onClick={() => this.setState({ error: null })}
            style={{
              marginTop:'8px',
              padding:'10px 24px',
              borderRadius:'8px',
              border:'1px solid var(--line-strong)',
              background:'var(--surface)',
              color:'var(--ink)',
              cursor:'pointer',
              fontSize:'0.9rem',
            }}
          >
            Reintentar
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
