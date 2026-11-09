variable "region" {
  type    = string
  default = "ap-northeast-2"
}
variable "env" {
  type    = string
  default = "staging"
}
variable "domain" {
  type        = string
  default     = "plit.ai.kr"
  description = "Route 53 호스팅 영역 도메인"
}
variable "api_subdomain" {
  type    = string
  default = "api-staging"
}
variable "api_image_tag" {
  type    = string
  default = "latest"
}
variable "api_desired_count" {
  type    = number
  default = 1
}
variable "db_instance_class" {
  type    = string
  default = "db.t4g.micro"
}
variable "alarm_email" {
  type    = string
  default = ""
}
