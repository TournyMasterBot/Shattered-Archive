import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class CauseLight implements IAbility {
    private static instance: CauseLight;

    name: string;
    helpFile: string;
    abilityGroupType: AbilityGroupType;
    abilityUsage: AbilityUsage;

    constructor() {
        this.name = "Cause Light";
        this.helpFile = `
help 'cause light'
'CAUSE LIGHT' 'CAUSE SERIOUS' 'CAUSE CRITICAL' HARM
'CAUSE LIGHT' 'CAUSE SERIOUS' 'CAUSE CRITICAL' HARM
Syntax: cast 'cause light'    <victim>
Syntax: cast 'cause serious'  <victim>
Syntax: cast 'cause critical' <victim>
Syntax: cast harm             <victim>
These spells inflict damage on the victim.  The higher-level spells do
more damage.
`;
        this.abilityGroupType = AbilityGroupType.Spells;
        this.abilityUsage = AbilityUsage.Active;

        if (CauseLight.instance === undefined) {
            CauseLight.instance = this;
        }
    }

    // Method to get the single instance of the class
    public static GetInstance(): CauseLight {
        if (!CauseLight.instance) {
            CauseLight.instance = new CauseLight();
        }
        return CauseLight.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return CauseLight.GetInstance() as T;
    }
}

export default CauseLight;