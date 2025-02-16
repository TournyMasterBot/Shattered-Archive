import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class KnowAlignment implements IAbility {
    private static instance: KnowAlignment;

    name: string;
    helpFile: string;
    abilityGroupType: AbilityGroupType;
    abilityUsage: AbilityUsage;

    constructor() {
        this.name = "Know Alignment";
        this.helpFile = `
help 'Know Alignment'
'KNOW ALIGNMENT'
'KNOW ALIGNMENT'

Syntax: cast 'know alignment' <character>
This spell reveals the alignment of the target character.
        `;
        this.abilityGroupType = AbilityGroupType.Spells; // Set to 'Spells'
        this.abilityUsage = AbilityUsage.Active;

        if (KnowAlignment.instance === undefined) {
            KnowAlignment.instance = this;
        }
    }

    // Method to get the single instance of the class
    public static GetInstance(): KnowAlignment {
        if (!KnowAlignment.instance) {
            KnowAlignment.instance = new KnowAlignment();
        }
        return KnowAlignment.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return KnowAlignment.GetInstance() as T;
    }
}

export default KnowAlignment;