import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class ProtectionCold implements IAbility {
    private static instance: ProtectionCold;

    name: string;
    helpFile: string;
    abilityGroupType: AbilityGroupType;
    abilityUsage: AbilityUsage;

    constructor() {
        this.name = "Protection Cold";
        this.helpFile = `help 'Protection Cold'
'PROTECTION COLD' 'PROTECTION FIRE'
'PROTECTION COLD' 'PROTECTION FIRE'

Syntax: cast 'protection cold'
        cast 'protection fire'

These protection spells call forth powerful defensive magics to shield the
wielder from attacks of either cold or flame respectively.  The protection
spells reduce the damage taken from said attacks.  

See also - NATURE`;
        this.abilityGroupType = AbilityGroupType.Spells;
        this.abilityUsage = AbilityUsage.Active;

        if (ProtectionCold.instance === undefined) {
            ProtectionCold.instance = this;
        }
    }

    // Method to get the single instance of the class
    public static GetInstance(): ProtectionCold {
        if (!ProtectionCold.instance) {
            ProtectionCold.instance = new ProtectionCold();
        }
        return ProtectionCold.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return ProtectionCold.GetInstance() as T;
    }
}

export default ProtectionCold;