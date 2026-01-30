import React from 'react';
import { Typography, Card, Button } from 'antd';
import { useNavigate } from 'react-router-dom';
import { ArrowLeftOutlined } from '@ant-design/icons';

const { Title, Paragraph, Text } = Typography;

const PrivacyPolicy: React.FC = () => {
    const navigate = useNavigate();

    return (
        <div style={{ maxWidth: 1000, margin: '20px auto', padding: '0 20px' }}>
            <Button
                icon={<ArrowLeftOutlined />}
                onClick={() => navigate(-1)}
                style={{ marginBottom: 16 }}
            >
                返回
            </Button>

            <Card>
                <Typography>
                    <Title level={2}>隐私政策</Title>
                    <Paragraph>
                        <Text type="secondary">最后更新日期：2024年1月1日</Text>
                    </Paragraph>

                    <Paragraph>
                        量鲸智能量化选股平台（以下简称“我们”）尊重并保护您的隐私。本《隐私政策》旨在向您说明我们如何收集、使用、存储和保护您的个人信息。
                        请您仔细阅读本政策。
                    </Paragraph>

                    <Title level={4}>1. 我们收集的信息</Title>
                    <Paragraph>
                        1.1 <Text strong>注册信息：</Text> 当您注册账号时，我们需要收集您的用户名、密码、手机号码或电子邮箱等信息。
                    </Paragraph>
                    <Paragraph>
                        1.2 <Text strong>使用日志：</Text> 当您使用本平台服务时，我们会自动收集您的操作记录、浏览历史、IP地址、设备信息等日志信息，用于系统维护和安全分析（如登录异常检测）。
                    </Paragraph>
                    <Paragraph>
                        1.3 <Text strong>自选股数据：</Text> 您在平台添加的自选股列表信息。
                    </Paragraph>

                    <Title level={4}>2. 信息的用途</Title>
                    <Paragraph>
                        我们收集的信息主要用于：
                        <ul>
                            <li>为您提供账号管理、身份认证功能；</li>
                            <li>为您提供个性化的股票分析和选股服务；</li>
                            <li>发送服务通知、安全验证码；</li>
                            <li>改进我们的服务，提升用户体验；</li>
                            <li>保障平台安全，防范欺诈和违法行为。</li>
                        </ul>
                    </Paragraph>

                    <Title level={4}>3. 信息共享与披露</Title>
                    <Paragraph>
                        我们承诺不会向任何第三方出售您的个人信息。除以下情况外，我们不会向第三方共享您的信息：
                        <ul>
                            <li>获得您的明确授权；</li>
                            <li>根据法律法规或政府部门的要求；</li>
                            <li>为维护我们的合法权益或公共安全。</li>
                        </ul>
                    </Paragraph>

                    <Title level={4}>4. 数据安全</Title>
                    <Paragraph>
                        我们将采取合理的技术措施（如加密传输、加密存储、访问控制等）来保护您的个人信息安全，防止信息泄露、丢失或被滥用。
                        <br />
                        尽管如此，请您理解互联网并非绝对安全的环境，我们无法保证信息的绝对安全。
                    </Paragraph>

                    <Title level={4}>5. Cookie 的使用</Title>
                    <Paragraph>
                        为了提供更好的用户体验，我们可能会使用 Cookie 或类似技术来记录您的登录状态和偏好设置。您可以通过浏览器设置拒绝 Cookie，但这可能导致您无法使用部分功能。
                    </Paragraph>

                    <Title level={4}>6. 未成年人保护</Title>
                    <Paragraph>
                        本平台主要面向成年人提供服务。如果您是未成年人，请在监护人的指导下使用本平台。
                    </Paragraph>

                    <Title level={4}>7. 政策变更</Title>
                    <Paragraph>
                        我们可能会适时修订本《隐私政策》。修订后的政策将发布在平台上。
                    </Paragraph>

                    <Title level={4}>8. 联系我们</Title>
                    <Paragraph>
                        如果您对本隐私政策有任何疑问或建议，请通过平台客服渠道联系我们。
                    </Paragraph>
                </Typography>
            </Card>

            <div style={{ textAlign: 'center', marginTop: 40, marginBottom: 40, color: '#888' }}>
                &copy; 2024 量鲸 QuantWhale. All rights reserved.
            </div>
        </div>
    );
};

export default PrivacyPolicy;
