import DslError from "@shared/types/error-types/dsl-error";

export interface IStatAttribute {
    id: string;
    name: string;
    displayName: string;
    type: StatAttributeType;
    modifier: number;
}

export enum StatAttributeType {
    /**
     * This is used for variable modifiers, like race.
     * These modifiers are context specific
     */
    Variable = "Variable",
    Strength = "Strength",
    Intelligence = "Intelligence",
    Wisdom = "Wisdom",
    Dexterity = "Dexterity",
    Constitution = "Constitution"
}

export class StatAttribute implements IStatAttribute {
    public id: string;
    public displayName: string;
    public name: string;
    public type: StatAttributeType;
    public modifier: number;

    constructor(config: Partial<StatAttribute>) {
        this.type = config.type!;
        this.modifier = config.modifier!;
        switch(this.type) {
            case StatAttributeType.Variable: {
                this.id = "0";
                this.name = "variable";
                this.displayName = "Variable";
                break;
            }
            case StatAttributeType.Strength: {
                this.id = "1";
                this.name = "str";
                this.displayName = "Strength";
                break;
            }
            case StatAttributeType.Intelligence: {
                this.id = "2";
                this.name = "int";
                this.displayName = "Intelligence";
                break;
            }
            case StatAttributeType.Wisdom: {
                this.id = "4";
                this.name = "wis";
                this.displayName = "Wisdom";
                break;
            }
            case StatAttributeType.Dexterity: {
                this.id = "8";
                this.name = "dex";
                this.displayName = "Dexterity";
                break;
            }
            case StatAttributeType.Constitution: {
                this.id = "16";
                this.name = "con";
                this.displayName = "Constitution";
                break;
            }
            default: {
                throw new DslError({
                    message: "Invalid stat attribute type",
                    traceLocation: "stat-attribute.constructor.error"
                })
            }
        }
    }
    
    public values(): StatAttributeType[] {
        return [
            StatAttributeType.Strength,
            StatAttributeType.Intelligence,
            StatAttributeType.Wisdom,
            StatAttributeType.Dexterity,
            StatAttributeType.Constitution,
        ];
    }
}