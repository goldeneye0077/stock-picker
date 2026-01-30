import React from 'react';
import { Typography, Card, Button } from 'antd';
import { useNavigate } from 'react-router-dom';
import { ArrowLeftOutlined } from '@ant-design/icons';

const { Title, Paragraph, Text } = Typography;

const UserAgreement: React.FC = () => {
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
                    <Title level={2}>用户服务协议</Title>
                    <Paragraph>
                        <Text type="secondary">最后更新日期：2024年1月1日</Text>
                    </Paragraph>

                    <Paragraph>
                        欢迎您使用量鲸智能量化选股平台（以下简称“本平台”）。请您在注册和使用本平台服务之前，仔细阅读本《用户服务协议》（以下简称“本协议”）。
                        如果您不同意本协议的任何内容，请您立即停止注册或使用本平台服务。当您注册或使用本平台服务时，即视为您已完全同意并接受本协议的所有条款。
                    </Paragraph>

                    <Title level={4}>1. 服务内容</Title>
                    <Paragraph>
                        1.1 本平台利用人工智能和大数据技术，为用户提供股票数据分析、量化策略选股、市场行情监测等辅助投资工具。
                    </Paragraph>
                    <Paragraph>
                        1.2 <Text strong>风险提示：本平台提供的所有数据、分析结果、选股建议仅供参考，不构成任何投资建议或承诺。股市有风险，投资需谨慎。用户应独立判断并承担投资风险，本平台不承担任何因使用本平台服务而产生的直接或间接损失。</Text>
                    </Paragraph>

                    <Title level={4}>2. 用户账号</Title>
                    <Paragraph>
                        2.1 您需要注册一个账号来使用本平台的部分或全部功能。您保证注册时提供的信息真实、准确、完整。
                    </Paragraph>
                    <Paragraph>
                        2.2 您有责任妥善保管您的账号和密码，并对您账号下发生的所有活动承担责任。如发现账号被非法使用，请立即联系我们要。
                    </Paragraph>

                    <Title level={4}>3. 用户行为规范</Title>
                    <Paragraph>
                        3.1 您承诺合法合规使用本平台，不得利用本平台从事任何违法违规活动，包括但不限于：
                        <ul>
                            <li>发布、传播违反法律法规、公序良俗的信息；</li>
                            <li>干扰本平台的正常运行，攻击服务器或网络；</li>
                            <li>恶意抓取、爬取本平台数据；</li>
                            <li>利用本平台进行洗钱、非法集资等犯罪活动。</li>
                        </ul>
                    </Paragraph>

                    <Title level={4}>4. 知识产权</Title>
                    <Paragraph>
                        4.1 本平台的所有内容（包括但不限于文字、图片、音频、视频、软件、代码、算法）的知识产权归本平台或相关权利人所有。未经授权，您不得擅自复制、修改、传播或用于商业用途。
                    </Paragraph>

                    <Title level={4}>5. 隐私保护</Title>
                    <Paragraph>
                        5.1 我们非常重视您的隐私。我们将按照《隐私政策》收集、使用和保护您的个人信息。请您详细阅读《隐私政策》。
                    </Paragraph>

                    <Title level={4}>6. 免责声明</Title>
                    <Paragraph>
                        6.1 本平台将尽力保证服务的稳定性和数据的准确性，但不提供任何形式的明示或暗示的保证。
                    </Paragraph>
                    <Paragraph>
                        6.2 因不可抗力（如自然灾害、政策变动、黑客攻击、电信故障等）导致的服务中断或数据丢失，本平台不承担责任。
                    </Paragraph>

                    <Title level={4}>7. 协议修改</Title>
                    <Paragraph>
                        7.1 本平台有权随时修改本协议。修改后的协议将在本平台公布，即视为通知。如果您继续使用本平台，即视为接受修改后的协议。
                    </Paragraph>

                    <Title level={4}>8. 其他</Title>
                    <Paragraph>
                        8.1 本协议的解释权归量鲸智能量化选股平台所有。
                    </Paragraph>
                    <Paragraph>
                        8.2 因本协议产生的争议，双方应友好协商解决；协商不成的，应提交本平台所在地有管辖权的人民法院诉讼解决。
                    </Paragraph>
                </Typography>
            </Card>

            <div style={{ textAlign: 'center', marginTop: 40, marginBottom: 40, color: '#888' }}>
                &copy; 2024 量鲸 QuantWhale. All rights reserved.
            </div>
        </div>
    );
};

export default UserAgreement;
