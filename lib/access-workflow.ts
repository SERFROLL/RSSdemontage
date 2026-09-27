export type AccessRole='observer'|'employee'|'admin';
export function applicantComment(value:unknown){
 const comment=typeof value==='string'?value.trim():'';
 if(!comment||comment.length>300)throw Error('Представьтесь одним сообщением — от 1 до 300 символов.');
 return comment;
}
export function accessAssignment(value:{employee?:unknown;name?:unknown;role?:unknown}){
 if(!['observer','employee','admin'].includes(String(value.role)))throw Error('Выберите роль.');
 const employee=typeof value.employee==='string'?value.employee.trim():'';
 const name=typeof value.name==='string'?value.name.trim().replace(/\s+/g,' '):'';
 if(!employee&&(!name||name.length>120))throw Error('Выберите сотрудника или введите его имя и фамилию.');
 return {employee,name,role:value.role as AccessRole};
}
export const accessMessages={
 introduce:'Как вас представить администратору? Напишите ФИО одним сообщением.',
 pending:'Ваш запрос доступа обрабатывает администратор. Ждите ответа.',
 approved:'Вам предоставлен доступ. Нажмите «ОТКРЫТЬ УЧЁТ».',
 rejected:'Вам отказано в доступе.',
 disabled:'Ваш доступ отключён. Обратитесь к администратору.'
};
