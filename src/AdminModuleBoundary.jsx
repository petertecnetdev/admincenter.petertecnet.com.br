import { Component } from 'react'

let moduleBoundarySequence = 0

export default class AdminModuleBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null, revision: 0 }
    this.errorHeadingRef = null
    this.boundaryId = `admin-module-error-${++moduleBoundarySequence}`
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error(`[Admin Center] Falha isolada no módulo ${this.props.name || 'administrativo'}`, error, info)
  }

  componentDidUpdate(previousProps, previousState) {
    if (!previousState.error && this.state.error && this.errorHeadingRef) {
      this.errorHeadingRef.focus()
    }
  }

  retry = () => {
    this.setState(state => ({ error: null, revision: state.revision + 1 }))
  }

  render() {
    if (this.state.error) {
      const moduleName = this.props.name || 'Área administrativa'
      const headingId = `${this.boundaryId}-heading`
      const descriptionId = `${this.boundaryId}-description`

      return <section
        className="admin-module-error"
        role="alert"
        aria-labelledby={headingId}
        aria-describedby={descriptionId}
      >
        <div className="admin-module-error-icon" aria-hidden="true">!</div>
        <div>
          <small>MÓDULO ISOLADO</small>
          <h3
            id={headingId}
            ref={node => { this.errorHeadingRef = node }}
            tabIndex="-1"
          >
            {moduleName} encontrou um problema
          </h3>
          <p id={descriptionId}>O restante do Admin Center continua disponível. Tente carregar somente esta área novamente.</p>
          <button type="button" onClick={this.retry}>Tentar novamente</button>
        </div>
      </section>
    }

    return <div key={this.state.revision}>{this.props.children}</div>
  }
}
