import { Col, Row, Space, Typography } from "antd";
import atlassianLogo from "../../assets/atlassian.svg";
import indeedLogo from "../../assets/indeed.svg";
import verizonLogo from "../../assets/verizon.svg";
import zalandoLogo from "../../assets/zalando.svg";
import "./index.scss";

export const CompaniesSection = () => {
  const companies = [
    { src: atlassianLogo, alt: "atlassian" },
    { src: indeedLogo, alt: "indeed" },
    { src: verizonLogo, alt: "verizon" },
    { src: zalandoLogo, alt: "zalando" },
  ];

  return (
    <Row justify="center" align="middle" className="w-full companies-row">
      <Space direction="vertical" className="companies-wrapper">
        <Typography.Text className="companies-section-header">
          Trusted by developer & QA teams from 50,000+ organizations
        </Typography.Text>
        <Col>
          <Space direction="horizontal" size={24}>
            {companies.map((company) => (
              <img key={company.alt} src={company.src} alt={company.alt} />
            ))}
          </Space>
        </Col>
      </Space>
    </Row>
  );
};
