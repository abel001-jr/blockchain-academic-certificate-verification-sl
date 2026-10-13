export function restoreDraftForm(draft, departments, programs, grades) {
  const department = departments.find(item => item.name === draft.department);
  const matches = programs.filter(item => item.department === department?.id && (item.title === draft.degree_title || item.full_title === draft.degree_title));
  return {
    student_name: draft.student_name || "",
    student_email: draft.student_email || "",
    graduation_year: draft.graduation_year,
    department_id: department?.id || "",
    program_id: matches.length === 1 ? matches[0].id : "",
    grade_classification_id: grades.find(item => item.label === draft.grade)?.id || "",
  };
}
