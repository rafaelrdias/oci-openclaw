# Infra OCI Opcional

Este arquivo contem um caminho manual para criar a infraestrutura base na OCI. Ele e opcional: se voce ja tem uma VM Oracle Linux 9 acessivel por SSH, pode voltar ao [README principal](../README.md) e seguir a instalacao no servidor.

Para provisionamento automatizado, prefira o Terraform em [terraform/oci-trial-deploy](terraform/oci-trial-deploy/README.md).

## Recursos criados

- VCN;
- Internet Gateway;
- Route Table com saida para internet;
- Security List com SSH/HTTP/HTTPS;
- Subnet publica;
- Compute Instance Oracle Linux 9.

## Variaveis locais

Execute na maquina que tem OCI CLI configurado:

```bash
export OCI_CLI_PROFILE=DEFAULT
export REGION="us-chicago-1"
export COMPARTMENT_OCID="ocid1.compartment.oc1..example"
export PREFIX="openclaw"
export SSH_PUBLIC_KEY_FILE="$HOME/.ssh/id_rsa.pub"
export SHAPE="VM.Standard.E5.Flex"
export VCN_CIDR="10.20.0.0/16"
export SUBNET_CIDR="10.20.10.0/24"

oci setup repair-file-permissions --file "$HOME/.oci/config"

export AD=$(oci iam availability-domain list \
  --compartment-id "$COMPARTMENT_OCID" \
  --query 'data[0].name' \
  --raw-output)
```

## Rede

```bash
VCN_ID=$(oci network vcn create \
  --compartment-id "$COMPARTMENT_OCID" \
  --display-name "$PREFIX-vcn" \
  --cidr-block "$VCN_CIDR" \
  --dns-label "openclaw" \
  --query 'data.id' \
  --raw-output)

IGW_ID=$(oci network internet-gateway create \
  --compartment-id "$COMPARTMENT_OCID" \
  --vcn-id "$VCN_ID" \
  --display-name "$PREFIX-igw" \
  --is-enabled true \
  --query 'data.id' \
  --raw-output)

RT_ID=$(oci network route-table create \
  --compartment-id "$COMPARTMENT_OCID" \
  --vcn-id "$VCN_ID" \
  --display-name "$PREFIX-public-rt" \
  --route-rules "[{\"cidrBlock\":\"0.0.0.0/0\",\"networkEntityId\":\"$IGW_ID\"}]" \
  --query 'data.id' \
  --raw-output)

SL_ID=$(oci network security-list create \
  --compartment-id "$COMPARTMENT_OCID" \
  --vcn-id "$VCN_ID" \
  --display-name "$PREFIX-public-sl" \
  --egress-security-rules '[{"destination":"0.0.0.0/0","protocol":"all"}]' \
  --ingress-security-rules "[{\"source\":\"0.0.0.0/0\",\"protocol\":\"6\",\"tcpOptions\":{\"destinationPortRange\":{\"min\":22,\"max\":22}}},{\"source\":\"0.0.0.0/0\",\"protocol\":\"6\",\"tcpOptions\":{\"destinationPortRange\":{\"min\":80,\"max\":80}}},{\"source\":\"0.0.0.0/0\",\"protocol\":\"6\",\"tcpOptions\":{\"destinationPortRange\":{\"min\":443,\"max\":443}}}]" \
  --query 'data.id' \
  --raw-output)

SUBNET_ID=$(oci network subnet create \
  --compartment-id "$COMPARTMENT_OCID" \
  --vcn-id "$VCN_ID" \
  --display-name "$PREFIX-public-subnet" \
  --cidr-block "$SUBNET_CIDR" \
  --route-table-id "$RT_ID" \
  --security-list-ids "[\"$SL_ID\"]" \
  --prohibit-public-ip-on-vnic false \
  --dns-label "public" \
  --query 'data.id' \
  --raw-output)
```

## Imagem Oracle Linux 9

```bash
IMAGE_OCID=$(oci compute image list \
  --compartment-id "$COMPARTMENT_OCID" \
  --operating-system "Oracle Linux" \
  --operating-system-version "9" \
  --shape "$SHAPE" \
  --sort-by TIMECREATED \
  --sort-order DESC \
  --all \
  --query 'data[0].id' \
  --raw-output)
```

## Instancia

```bash
INSTANCE_ID=$(oci compute instance launch \
  --availability-domain "$AD" \
  --compartment-id "$COMPARTMENT_OCID" \
  --display-name "$PREFIX-vm" \
  --shape "$SHAPE" \
  --shape-config '{"ocpus":2,"memoryInGBs":16}' \
  --subnet-id "$SUBNET_ID" \
  --image-id "$IMAGE_OCID" \
  --assign-public-ip true \
  --ssh-authorized-keys-file "$SSH_PUBLIC_KEY_FILE" \
  --query 'data.id' \
  --raw-output)

oci compute instance get \
  --instance-id "$INSTANCE_ID" \
  --query 'data."lifecycle-state"' \
  --raw-output
```

Obtenha o IP publico:

```bash
PUBLIC_IP=$(oci compute instance list-vnics \
  --instance-id "$INSTANCE_ID" \
  --query 'data[0]."public-ip"' \
  --raw-output)

ssh opc@"$PUBLIC_IP"
```

Depois siga a instalacao no [README principal](../README.md#instalacao-no-servidor).
