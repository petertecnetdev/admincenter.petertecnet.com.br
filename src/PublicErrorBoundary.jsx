import { Component } from 'react'

export default class PublicErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error, info) {
    console.error('[Peter Tecnet Public Experience]', error, info)
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return <main style={{ minHeight: '100vh', background: '#02090d', color: '#e9fbff', display: 'grid', placeItems: 'center', padding: '32px', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <section style={{ width: 'min(720px, 100%)', border: '1px solid rgba(116,229,255,.18)', borderRadius: '24px', padding: '32px', background: 'rgba(5,22,29,.9)' }}>
        <img src="/petertecnet-brand.svg" alt="Peter Tecnet" style={{ width: '72px', height: '72px', objectFit: 'contain', marginBottom: '20px' }} />
        <p style={{ color: '#67ddf7', letterSpacing: '.12em', fontSize: '12px', fontWeight: 700 }}>PETER TECNET</p>
        <h1 style={{ fontSize: 'clamp(2rem, 7vw, 4rem)', lineHeight: 1, margin: '12px 0 18px' }}>Esta página encontrou um problema temporário.</h1>
        <p style={{ color: '#9db7bf', lineHeight: 1.7, marginBottom: '24px' }}>A navegação principal continua disponível. Você pode voltar ao início ou tentar abrir os conteúdos novamente.</p>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <a href="/" style={{ color: '#061015', background: '#70e4ff', textDecoration: 'none', padding: '12px 18px', borderRadius: '999px', fontWeight: 800 }}>Voltar ao início</a>
          <a href="/blog" style={{ color: '#e9fbff', border: '1px solid rgba(116,229,255,.24)', textDecoration: 'none', padding: '12px 18px', borderRadius: '999px', fontWeight: 700 }}>Abrir conteúdos</a>
        </div>
      </section>
    </main>
  }
}
