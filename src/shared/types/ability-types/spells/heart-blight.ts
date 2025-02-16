import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class HeartBlight implements IAbility {
    private static instance: HeartBlight;

    name: string;
    helpFile: string;
    abilityGroupType: AbilityGroupType;
    abilityUsage: AbilityUsage;

    constructor() {
        this.name = "Heart Blight";
        this.helpFile = `
help 'Heart Blight'
'HEART BLIGHT' HEARTBLIGHT
HEARTBLIGHT 'HEART BLIGHT'
Syntax: cast 'heart blight' <target>
       cast 'heart blight'
This spell causes incredible damage, as the heart of the victim becomes
diseased by the power of the caster. Power such as this could only be
granted by the gods; therefore, this spell is only available to clerics.
See also: CLERICS
`;
        this.abilityGroupType = AbilityGroupType.Spells;
        this.abilityUsage = AbilityUsage.Active;

        if (HeartBlight.instance === undefined) {
            HeartBlight.instance = this;
        }
    }

    // Method to get the single instance of the class
    public static GetInstance(): HeartBlight {
        if (!HeartBlight.instance) {
            HeartBlight.instance = new HeartBlight();
        }
        return HeartBlight.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return HeartBlight.GetInstance() as T;
    }
}

export default HeartBlight;