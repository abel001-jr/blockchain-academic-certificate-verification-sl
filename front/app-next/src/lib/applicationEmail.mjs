export function emailValidationMessage(input) {
  const value = String(input ?? "").trim();
  if (!value) return "Enter an email address.";
  if (value.length > 254) return "Use an email address with no more than 254 characters.";
  const parts = value.split("@");
  const [local, domain] = parts;
  if (!local || local.length > 64 || /\s/.test(value)) {
    return "Enter a valid email address without spaces.";
  }
  if (!/^[a-zA-Z]/.test(local)) {
    return "Start the email username with a letter. Numbers are allowed after the first letter.";
  }
  if (!/^[a-zA-Z][a-zA-Z0-9]*$/.test(local)) {
    return "Use only letters and numbers before @. Special characters are not allowed.";
  }
  if (parts.length !== 2 || !domain) return "Enter a complete email address, such as name@institution.edu.";
  const labels = domain.split(".");
  if (labels.length < 2 || labels.some(label => !/^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/.test(label))) {
    return "Enter a valid email domain, such as institution.edu.";
  }
  return "";
}
