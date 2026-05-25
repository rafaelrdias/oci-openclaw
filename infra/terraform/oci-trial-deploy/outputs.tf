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

output "gateway_url" {
  description = "Gateway bind address inside the VM."
  value       = "ws://127.0.0.1:${var.gateway_port}"
}

output "post_bootstrap_next_steps" {
  description = "Commands to run after cloud-init finishes."
  value = [
    "ssh -i <private-key-file> opc@${oci_core_instance.openclaw.public_ip}",
    "sudo tail -f /var/log/cloud-init-output.log",
    "nano ~/.openclaw/gateway.systemd.env",
    "openclaw gateway restart",
    "openclaw agent --agent odin --message 'Teste o web_search com uma fonte atual.' --json",
  ]
}
