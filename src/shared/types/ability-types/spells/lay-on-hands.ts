import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class LayOnHands implements IAbility {
    private static instance: LayOnHands;

    name: string;
    helpFile: string;
    abilityGroupType: AbilityGroupType;
    abilityUsage: AbilityUsage;

    constructor() {
        this.name = "Lay on Hands";
        this.helpFile = `
lay on hands
syntax: cast 'lay on hands' <target>
The Paladin has the ability to pray that his deity intercede in the life
of another. This intercession calls forth healing powers directly from the
deity which go beyond the scope of all known healing powers known in the
lands. This healing power completely restores the health of a single
person. Given the tremendous power and favor called forth from the deity,
the Paladin cannot request such power frequently.
see also: PALADIN, KNIGHTHOOD
        `;
        this.abilityGroupType = AbilityGroupType.Spells; // Set to 'Spells'
        this.abilityUsage = AbilityUsage.Active;

        if (LayOnHands.instance === undefined) {
            LayOnHands.instance = this;
        }
    }

    // Method to get the single instance of the class
    public static GetInstance(): LayOnHands {
        if (!LayOnHands.instance) {
            LayOnHands.instance = new LayOnHands();
        }
        return LayOnHands.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return LayOnHands.GetInstance() as T;
    }
}

export default LayOnHands;