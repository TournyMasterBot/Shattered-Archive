import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class Forget implements IAbility {
    private static instance: Forget;

    name: string;
    helpFile: string;
    abilityGroupType: AbilityGroupType;
    abilityUsage: AbilityUsage;

    constructor() {
        this.name = "Forget";
        this.helpFile = `
FORGET

Syntax:  cast 'forget' <target>
         cast 'forget'

The transmuter causes knowledge of critical skills and spells to slip
elusively from his enemy.  The enemy may be named as a target, or the spell
will default to the current foe if the caster is engaged in combat.  

See also - ALTERATION TRANSMUTER
`;
        this.abilityGroupType = AbilityGroupType.Spells;
        this.abilityUsage = AbilityUsage.Active;

        if (Forget.instance === undefined) {
            Forget.instance = this;
        }
    }

    // Method to get the single instance of the class
    public static GetInstance(): Forget {
        if (!Forget.instance) {
            Forget.instance = new Forget();
        }
        return Forget.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return Forget.GetInstance() as T;
    }
}

export default Forget;