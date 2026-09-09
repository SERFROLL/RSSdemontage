"use client";

import {useId, type ReactNode} from "react";
import {Plus, Check} from "lucide-react";
import {type Doc, type Role, roleNames, today} from "@/lib/domain";
import {initializationStatus} from "@/lib/initialization";
import {OpeningSummary, emptyInitialData} from "./initialization-fields";

type Props = {
 docs: Doc[];
 reviewIds: string[];
 onEdit: (title: string, action: string, data: any, old?: Doc) => void;
 onHistory: (id?: string) => void;
 exportPanel: ReactNode;
};
const format = (n: number, scale = 1) => new Intl.NumberFormat("ru-RU", {maximumFractionDigits: 3}).format(n / scale);
const productionRoles: Role[] = ["foreman", "winder", "shipper"];

function AddAction({children, onClick, reason, hint}: {children: ReactNode; onClick: () => void; reason?: string; hint?: string}) {
 const id = useId();
 return <div className="management-action">
  <button className="action secondary" onClick={onClick} disabled={!!reason} aria-describedby={reason || hint ? id : undefined}><Plus/>{children}</button>
  {(reason || hint) && <p id={id} className="draft-note">{reason || hint}</p>}
 </div>;
}

export function AdminOverview({docs, reviewIds, onEdit, onHistory, exportPanel}: Props) {
 const pids = docs.filter(d => d.kind === "pid"), cables = docs.filter(d => d.kind === "cable"), users = docs.filter(d => d.kind === "user");
 const assignments = docs.filter(d => d.kind === "assignment"), samples = docs.filter(d => d.kind === "coefficient"), adjustments = docs.filter(d => d.kind === "adjustment");
 const pending = pids.filter(p => initializationStatus(docs, p.id) === "pending");
 const initialized = pids.filter(p => !p.data.initializationRequired || initializationStatus(docs, p.id) !== "pending");
 const activePids = pids.filter(p => p.data.active !== false);
 const eligibleUsers = users.filter(u => u.data.active !== false && productionRoles.some(role => u.data.roles.includes(role)));
 const pidName = (id: string | null) => "ПИД " + (pids.find(p => p.id === id)?.data.code || "?");
 const cableName = (id: string) => cables.find(c => c.id === id)?.data.name || "Тип не найден";
 const userName = (id: string) => users.find(u => u.id === id)?.data.name || "Сотрудник";
 const noPid = !pids.length ? "Сначала добавьте ПИД." : undefined;
 const stockReason = noPid || (!pending.length ? "Начальные остатки всех ПИД уже подтверждены. Повторный ввод закрыт." : undefined);
 const assignmentReason = noPid || (!eligibleUsers.length ? "Сначала назначьте сотруднику роль прораба, намотчика или отправителя в разделе «Сотрудники»." : undefined);
 const sampleReason = noPid || (!cables.length ? "Сначала добавьте тип кабеля." : undefined);
 const adjustmentReason = sampleReason || (!initialized.length ? "Сначала подтвердите начальные остатки ПИД." : undefined);
 const addPid = () => onEdit("Новый ПИД", "pid", {code: "", cutoff: today(), active: true});
 const addCable = () => onEdit("Новый тип кабеля", "cable", {name: ""});
 const initialize = (pid = pending[0]?.id || "") => onEdit("Начальные остатки", "initialize", emptyInitialData(pid));
 const assign = () => onEdit("Закрепление за ПИД", "assignment", {pid: pids[0]?.id, userId: eligibleUsers[0]?.id, role: productionRoles.find(role => eligibleUsers[0]?.data.roles.includes(role)) || "foreman", from: today(), until: ""});
 const addSample = () => onEdit("Контрольное взвешивание", "coefficient", {pid: pids[0]?.id, cableId: cables[0]?.id, date: today(), sampleMetres: "", sampleKg: ""});
 const addAdjustment = () => onEdit("Корректировка по проверке", "adjustment", {pid: initialized[0]?.id, cableId: cables[0]?.id, date: today(), location: "pid", actualMetres: "", actualKg: "", actualCoils: "", reason: ""});
 const steps = [
  {title: "Добавьте ПИД", description: "Номер ПИД и дата начала учёта.", status: `Добавлено: ${pids.length}`, done: !!pids.length, action: <AddAction onClick={addPid}>Добавить ПИД</AddAction>},
  {title: "Добавьте типы кабеля", description: "Названия кабелей для остатков и операций.", status: `Типов кабеля: ${cables.length}`, done: !!cables.length, action: <AddAction onClick={addCable}>Добавить тип кабеля</AddAction>},
  {title: "Введите начальные остатки", description: "На ПИД — метры. На основном складе — килограммы без тары.", status: pids.length ? `Подтверждено ПИД: ${pids.length - pending.length} из ${pids.length}` : "ПИД ещё не добавлен", done: !!pids.length && !pending.length, action: <AddAction onClick={() => initialize()} reason={stockReason} hint={!cables.length && pending.length ? "Для строк остатков добавьте тип кабеля. Если остатков нет, подтвердите их отсутствие." : undefined}>Ввести начальные остатки</AddAction>},
  {title: "Закрепите сотрудников", description: "Укажите ПИД, рабочую роль и период работы.", status: `Закреплений: ${assignments.length}`, done: !!activePids.length && activePids.every(p => assignments.some(a => a.pid === p.id && eligibleUsers.some(u => u.id === a.data.userId && u.data.roles.includes(a.data.role)) && a.data.from <= today() && (!a.data.until || a.data.until >= today()))), action: <AddAction onClick={assign} reason={assignmentReason}>Закрепить сотрудника</AddAction>},
 ];

 return <>
  <section className="page-heading"><div><p className="eyebrow">АДМИНИСТРАТОР</p><h1>Управление</h1><p className="muted">Подготовка учёта и сохранённые данные</p></div></section>
  {reviewIds.length > 0 && <div className="notice section-gap">После поздних записей требуется повторно проверить корректировки: {reviewIds.length}. Автоматического изменения остатков нет.</div>}
  <section className="panel stack setup-guide" aria-labelledby="setup-heading">
   <div><h2 id="setup-heading">Начало работы</h2><p className="muted">Пройдите четыре шага. Ввод открывается кнопками, сохранённые записи отображаются ниже.</p></div>
   <ol className="setup-steps">{steps.map((step, i) => <li key={step.title} className={step.done ? "setup-step complete" : "setup-step"}>
    <div className="setup-step-title"><span className="setup-number" aria-label={step.done ? `Шаг ${i + 1} выполнен` : `Шаг ${i + 1}`}>{step.done ? <Check/> : i + 1}</span><h3>{step.title}</h3></div>
    <p className="muted">{step.description}</p><p className="setup-status">{step.status}</p>{step.action}
   </li>)}</ol>
  </section>

  <section className="management-section" aria-labelledby="opening-heading">
   <div className="section-title"><h2 id="opening-heading">Начальные остатки по ПИД</h2></div>
   <div className="panel stack"><p className="muted">Остатки на ПИД и основном складе на дату начала учёта. Каждый ПИД подтверждается один раз.</p>
    {!pids.length ? <div className="management-empty"><p>ПИД ещё не добавлены. После создания ПИД здесь появится ввод его начальных остатков.</p><AddAction onClick={addPid}>Добавить ПИД</AddAction></div> : pids.map(p => {
     const status = initializationStatus(docs, p.id), marker = docs.find(d => d.kind === "initialization" && d.pid === p.id);
     return <div className="list-row stack" key={p.id}><h3>{pidName(p.id)} · на начало {p.data.cutoff}</h3>{status === "pending" ? <>
      <p className="muted">Начальные остатки ещё не введены. Если кабеля нет, подтвердите отсутствие остатков для каждого места.</p><AddAction onClick={() => initialize(p.id)}>Ввести остатки</AddAction>
     </> : <><span className="badge done">Начальные остатки введены · повторный ввод закрыт</span>{status === "confirmed" && marker?.data.schemaVersion === 2 ? <OpeningSummary marker={marker} docs={docs}/> : <p className="muted">Сохранены начальные данные из прежней версии. Для расхождений используйте корректировку выбранного места хранения.</p>}<button className="action quiet" onClick={() => onHistory(marker?.id)}>Смотреть историю</button></>}</div>;
    })}
   </div>
  </section>

  <section id="management-staff" className="management-section" aria-labelledby="staff-heading">
   <div className="section-title"><h2 id="staff-heading">Сотрудники</h2></div>
   <div className="panel stack"><p className="muted">Для закрепления за ПИД назначьте рабочую роль: прораб, намотчик или отправитель. Права администратора можно сохранить одновременно.</p>
    <AddAction onClick={() => onEdit("Сотрудник", "user", {name: "", telegramId: "", roles: ["foreman"], active: true})}>Добавить сотрудника</AddAction>
    {users.length ? users.map(u => <div className="row spread list-row" key={u.id}><div><strong>{u.data.name}</strong><p className="muted">{u.data.roles.map((r: Role) => roleNames[r]).join(", ")}{u.data.active === false ? " · отключён" : ""}</p></div><button className="action quiet" onClick={() => onEdit("Сотрудник", "user", {...u.data}, u)}>Изменить</button></div>) : <p className="management-empty">Сотрудники ещё не добавлены.</p>}
   </div>
  </section>

  <section className="management-section" aria-labelledby="assignment-heading">
   <div className="section-title"><h2 id="assignment-heading">Закрепления</h2></div>
   <div className="panel stack"><p className="muted">Кто работает на каждом ПИД, в какой роли и в какие даты. По закреплениям формируется список ожидаемых отчётов.</p>
    <AddAction onClick={assign} reason={assignmentReason}>Закрепить сотрудника</AddAction>
    {assignments.length ? assignments.map(d => <div className="row spread list-row" key={d.id}><div><strong>{userName(d.data.userId)} · {pidName(d.pid)}</strong><p className="muted">{roleNames[d.data.role as Role]} · {d.data.from} — {d.data.until || "по настоящее время"}</p></div><button className="action quiet" onClick={() => onEdit("Изменить срок закрепления", "assignment", {...d.data, until: d.data.until || ""}, d)}>Изменить</button></div>) : <p className="management-empty">Сотрудники ещё не закреплены за ПИД.</p>}
   </div>
  </section>

  <section className="management-section" aria-labelledby="sample-heading">
   <div className="section-title"><h2 id="sample-heading">Контрольные замеры</h2></div>
   <div className="panel stack"><p className="muted">Взвесьте отрезок известной длины. Коэффициент кг/м будет рассчитан автоматически и понадобится для пересчёта массы в длину при отгрузке. Для начальных остатков замер не требуется.</p>
    <AddAction onClick={addSample} reason={sampleReason}>Добавить замер</AddAction>
    {samples.length ? <div className="management-table"><table className="data-table"><thead><tr><th>ПИД / тип кабеля</th><th>Дата</th><th>Кг/м</th></tr></thead><tbody>{samples.map(d => <tr key={d.id}><td>{pidName(d.pid)}<br/>{cableName(d.data.cableId)}</td><td>{d.date}</td><td>{format(d.data.sampleGrams / d.data.sampleMm)}</td></tr>)}</tbody></table></div> : <p className="management-empty">Контрольных замеров пока нет.</p>}
   </div>
  </section>

  <section className="management-section" aria-labelledby="adjustment-heading">
   <div className="section-title"><h2 id="adjustment-heading">Корректировки</h2></div>
   <div className="panel stack"><p className="muted">Исправление остатка по результатам проверки с указанием причины. Для первого ввода используйте начальные остатки.</p>
    <AddAction onClick={addAdjustment} reason={adjustmentReason}>Корректировка остатка</AddAction>
    {adjustments.length ? adjustments.map(d => <div className="list-row" key={d.id}><strong>{pidName(d.pid)} · {cableName(d.data.cableId)} · {d.data.location === "warehouse" ? "Основной склад" : "На ПИД"}</strong><p>{d.data.reason}</p><p className="muted">{d.data.location === "warehouse" ? format(d.data.deltaGrams || 0, 1000) + " кг" : format(d.data.deltaMm || 0, 1000) + " м"}{d.data.deltaCoils ? " · " + d.data.deltaCoils + " катушек" : ""}{reviewIds.includes(d.id) ? " · нужна повторная проверка" : ""}</p><button className="action quiet" onClick={() => onEdit("Повторная проверка корректировки", "adjustment", {pid: d.pid, cableId: d.data.cableId, date: d.date, location: d.data.location || "pid", actualMetres: d.data.actualMm == null ? "" : String(d.data.actualMm / 1000), actualKg: d.data.actualGrams == null ? "" : String(d.data.actualGrams / 1000), actualCoils: d.data.actualCoils ?? "", reason: d.data.reason}, d)}>Проверить</button></div>) : <p className="management-empty">Корректировок нет.</p>}
   </div>
  </section>
  <section className="management-section" aria-label="Выгрузка данных"><div className="section-title"><h2>Файл для 1С</h2></div>{exportPanel}</section>
  <p className="footer-note">Учёт ведётся в мини-приложении. Файлы и сообщения из переписки с ботом в учёт не переносятся.</p>
 </>;
}
