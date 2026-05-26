output "instance_id" {
  description = "OCI instance OCID."
  value       = oci_core_instance.openclaw.id
}

output "public_ip" {
  description = "Public IP assigned to the OpenClaw VM."
  value       = oci_core_instance.openclaw.public_ip
}

output "ssh_command" {
  description = "SSH command template for the opc user. Replace <private-key-file> with the private key paired with ssh_public_key."
  value       = "ssh -i <private-key-file> opc@${oci_core_instance.openclaw.public_ip}"
}

output "ssh_config_alias" {
  description = "Suggested local SSH host alias for this VM."
  value       = local.ssh_config_alias
}

output "ssh_config_entry" {
  description = "Suggested ~/.ssh/config entry. Replace <private-key-file> with the private key paired with ssh_public_key."
  value       = <<-EOT
Host ${local.ssh_config_alias}
  HostName ${oci_core_instance.openclaw.public_ip}
  User opc
  IdentityFile <private-key-file>
  IdentitiesOnly yes
  StrictHostKeyChecking accept-new
  UpdateHostKeys no
EOT
}

output "gateway_url" {
  description = "Gateway bind address inside the VM."
  value       = "ws://127.0.0.1:${var.gateway_port}"
}

output "post_bootstrap_next_steps" {
  description = "Commands to run after cloud-init finishes."
  value = [
    "Add ssh_config_entry to ~/.ssh/config, replacing <private-key-file> with your private key path.",
    "ssh -i <private-key-file> opc@${oci_core_instance.openclaw.public_ip}",
    "sudo tail -f /var/log/cloud-init-output.log",
    "Follow POST_DEPLOY.md to configure credentials and validate Odin.",
    "nano ~/.openclaw/gateway.systemd.env",
    "openclaw gateway restart",
    "openclaw agent --agent odin --message 'Teste o web_search com uma fonte atual.' --json",
  ]
}
