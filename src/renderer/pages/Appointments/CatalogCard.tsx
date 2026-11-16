import { Image as ImageIcon, Plus } from 'lucide-react';
import styled from 'styled-components';

/**
 * One service in the registration catalog: its picture (till only), name, type badge (custom
 * order type or built-in kind, in its colour) and price. The whole card adds the service.
 */
export interface CatalogCardProps {
  name: string;
  image: string | null;
  typeLabel: string;
  typeColor: string;
  price: string;
  onAdd: () => void;
  addLabel: string;
}

export function CatalogCard({
  name,
  image,
  typeLabel,
  typeColor,
  price,
  onAdd,
  addLabel,
}: CatalogCardProps) {
  return (
    <Card type="button" onClick={onAdd} title={`${addLabel}: ${name}`} $color={typeColor}>
      <Picture>
        {image ? <img src={image} alt="" /> : <ImageIcon size={28} aria-hidden="true" />}
      </Picture>
      <Badge $color={typeColor}>{typeLabel}</Badge>
      <Name>{name}</Name>
      <Foot>
        <Price>{price}</Price>
        <AddDot aria-hidden="true">
          <Plus size={14} />
        </AddDot>
      </Foot>
    </Card>
  );
}

const Card = styled.button<{ $color: string }>`
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 6px;
  padding: 10px;
  text-align: left;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-top: 3px solid ${({ $color }) => $color};
  border-radius: ${({ theme }) => theme.borderRadius};
  background: ${({ theme }) => theme.colors.background};
  color: ${({ theme }) => theme.colors.text};
  cursor: pointer;
  transition:
    border-color 0.12s,
    box-shadow 0.12s,
    transform 0.12s;
  &:hover,
  &:focus-visible {
    outline: none;
    border-color: ${({ theme }) => theme.colors.primary};
    border-top-color: ${({ $color }) => $color};
    box-shadow: ${({ theme }) => theme.shadows.md};
  }
  &:active {
    transform: translateY(1px);
  }
`;

const Picture = styled.div`
  height: 96px;
  display: grid;
  place-items: center;
  border-radius: ${({ theme }) => theme.borderRadius};
  background: ${({ theme }) => theme.colors.surface};
  color: ${({ theme }) => theme.colors.textSecondary};
  overflow: hidden;
  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
`;

const Badge = styled.span<{ $color: string }>`
  align-self: flex-start;
  max-width: 100%;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  color: ${({ $color }) => $color};
  background: ${({ $color }) => `${$color}1f`};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const Name = styled.span`
  font-size: 13px;
  font-weight: 600;
  line-height: 1.3;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  min-height: 34px;
`;

const Foot = styled.span`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  margin-top: auto;
`;

const Price = styled.span`
  font-size: 13px;
  font-weight: 700;
`;

const AddDot = styled.span`
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border-radius: 999px;
  background: ${({ theme }) => theme.colors.primary};
  color: #fff;
`;
