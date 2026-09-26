/** Full dashboard-shaped loading state used while protected routes initialise. */
export default function DashboardLoader({ label = "Loading dashboard" }) {
  const items = Array.from({ length: 4 });

  return (
    <div className="cd-dashboard-loader" role="status" aria-label={label}>
      <aside className="cd-dashboard-loader__sidebar" aria-hidden="true">
        <div className="cd-dashboard-loader__brand"><span /><b>Credence</b></div>
        {[0, 1, 2, 3, 4].map((item) => <i className={item === 0 ? "is-active" : ""} key={item} />)}
        <div className="cd-dashboard-loader__profile"><i /><i /></div>
      </aside>
      <main className="cd-dashboard-loader__main" aria-hidden="true">
        <header><div><i className="sk title" /><i className="sk subtitle" /></div><div className="user"><i className="sk avatar" /><i className="sk username" /></div></header>
        <section className="stats">{items.map((_, item) => <div className="stat" key={item}><i className="sk icon" /><i className="sk value" /><i className="sk label" /></div>)}</section>
        <section className="panels"><div className="panel"><i className="sk heading" /><div className="chart">{[38,55,45,70,52,82,63,91].map((height, item) => <i className="sk bar" style={{ height: `${height}%` }} key={item} />)}</div></div><div className="panel"><i className="sk heading" /><div className="activity">{items.map((_, item) => <div key={item}><i className="sk dot" /><span><i className="sk line" /><i className="sk subline" /></span></div>)}</div></div></section>
      </main>
      <div className="cd-dashboard-loader__overlay"><div className="cd-dashboard-loader__card"><div className="spinner"><i /></div><strong>Loading Dashboard</strong><p>Preparing your Credence workspace<span className="dots"><i>.</i><i>.</i><i>.</i></span></p></div></div>
    </div>
  );
}
