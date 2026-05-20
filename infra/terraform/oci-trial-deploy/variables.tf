variable "region" {
  description = "OCI region used by the provider and by the default OCI Responses endpoint."
  type        = string
  default     = "us-chicago-1"
}

variable "compartment_ocid" {
  description = "Compartment OCID where all resources will be created."
  type        = string
}

variable "prefix" {
  description = "Name prefix for all OCI resources."
  type        = string
  default     = "openclaw-trial"
}

variable "ssh_public_key_path" {
  description = "Path to the public SSH key authorized for opc. Used by Terraform CLI when ssh_public_key is empty."
  type        = string
  default     = "~/.ssh/id_rsa.pub"
}

variable "ssh_public_key" {
  description = "Public SSH key authorized for opc. Prefer this when running from OCI Resource Manager Console."
  type        = string
  default     = ""
}

variable "ssh_allowed_cidr" {
  description = "CIDR allowed to access SSH. Prefer your current public IP /32."
  type        = string
  default     = "0.0.0.0/0"
}

variable "vcn_cidr" {
  description = "CIDR block for the VCN."
  type        = string
  default     = "10.20.0.0/16"
}

variable "subnet_cidr" {
  description = "CIDR block for the public subnet."
  type        = string
  default     = "10.20.10.0/24"
}

variable "availability_domain_index" {
  description = "Index of the availability domain returned by OCI."
  type        = number
  default     = 0
}

variable "instance_shape" {
  description = "OCI compute shape. Adjust for your trial quota."
  type        = string
  default     = "VM.Standard.E5.Flex"
}

variable "instance_ocpus" {
  description = "OCPUs for flexible shapes."
  type        = number
  default     = 2
}

variable "instance_memory_in_gbs" {
  description = "Memory in GB for flexible shapes."
  type        = number
  default     = 16
}

variable "boot_volume_size_gbs" {
  description = "Boot volume size."
  type        = number
  default     = 80
}

variable "oracle_linux_version" {
  description = "Oracle Linux major version used to discover the image."
  type        = string
  default     = "9"
}

variable "image_ocid" {
  description = "Optional custom image OCID. Leave empty to use the latest Oracle Linux image."
  type        = string
  default     = ""
}

variable "gateway_port" {
  description = "OpenClaw Gateway port bound to loopback."
  type        = number
  default     = 18789
}

variable "openclaw_npm_version" {
  description = "OpenClaw npm version to install."
  type        = string
  default     = "latest"
}

variable "oci_responses_region" {
  description = "OCI Responses region exported in the gateway environment."
  type        = string
  default     = "us-chicago-1"
}

variable "grok_model_id" {
  description = "Grok model ID exposed by the custom plugin."
  type        = string
  default     = "xai.grok-4-1-fast-reasoning"
}

variable "gptoss_model_id" {
  description = "Optional GPT-OSS fallback model ID."
  type        = string
  default     = "custom-inference-generativeai-us-chicago-1-oci-oraclecloud-com/openai.gpt-oss-120b"
}

variable "install_nginx" {
  description = "Install and start Nginx for future UI/proxy use."
  type        = bool
  default     = true
}
