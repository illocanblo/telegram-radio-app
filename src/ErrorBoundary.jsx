import React from 'react'

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('Nenormalizm Recs render error', error, info)
  }

  retry = () => {
    this.setState({ error: null })
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <main style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        padding: 24,
        background: 'var(--bg, #07080c)',
        color: 'var(--text, #eef1f8)',
      }}>
        <section style={{ maxWidth: 460, textAlign: 'center' }}>
          <h1 style={{ marginBottom: 12 }}>Не удалось открыть приложение</h1>
          <p style={{ marginBottom: 20, color: 'var(--muted, #9aa3bf)' }}>
            Произошла непредвиденная ошибка интерфейса. Повторите попытку или перезагрузите страницу.
          </p>
          <button className="btn btn-primary" onClick={this.retry}>Повторить</button>
        </section>
      </main>
    )
  }
}
