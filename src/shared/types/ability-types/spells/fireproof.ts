import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class Fireproof implements IAbility {
    private static instance: Fireproof;

    name: string;
    helpFile: string;
    abilityGroupType: AbilityGroupType;
    abilityUsage: AbilityUsage;

    constructor() {
        this.name = "Fireproof";
        this.helpFile = `
help 'Fireproof'
FIREPROOF
Syntax: cast 'fireproof' <object>
The fireproof spell creates a short-lived protective aura around an object,
to protect it from the harmful effects of acid and flame. Items protected
by this spell are not harmed by acid, fire, or the heat metal spell.
Although inexpensive to use, the spell's short duration makes it impractical
for protecting large numbers of objects.
`;
        this.abilityGroupType = AbilityGroupType.Spells;
        this.abilityUsage = AbilityUsage.Active;

        if (Fireproof.instance === undefined) {
            Fireproof.instance = this;
        }
    }

    // Method to get the single instance of the class
    public static GetInstance(): Fireproof {
        if (!Fireproof.instance) {
            Fireproof.instance = new Fireproof();
        }
        return Fireproof.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return Fireproof.GetInstance() as T;
    }
}

export default Fireproof;