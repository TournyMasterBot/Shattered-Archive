import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class Charge implements IAbility {
    private static instance: Charge;

    name: string;
    helpFile: string;
    manualDescription?: string | undefined;
    duration?: number | undefined;
    effects?: SkillSpellEffects | undefined;
    group?: string | undefined;
    alternateKeyword?: string | undefined;
    recommendedHelpFileChanges?: string | undefined;
    abilityGroupType: AbilityGroupType;
    abilityUsage: AbilityUsage;

    constructor() {
        this.name = "Charge";
        this.abilityGroupType = AbilityGroupType.Skills;
        this.abilityUsage = AbilityUsage.Active;
        this.helpFile = `help charge
CHARGE
Syntax:  charge <direction> <target>
         charge <target>
         charge
Charge is an attack skill used when riding a mount and wielding a
polearm.  It therefore requires that you know both the riding and polearm
skills before you can use it.  Only Warriors, Paladins, Barbarians and 
Crusaders have what it takes to learn this skill.  You may charge a target 
to initiate combat.  You may charge without a target if combat is already
underway.  You can also charge from a adjacent room.  
 
See also:  RIDING, POLEARM`;

        if (Charge.instance === undefined) {
            Charge.instance = this;
        }
    }
    
    // Method to get the single instance of the class
    public static GetInstance(): Charge {
        if (!Charge.instance) {
            Charge.instance = new Charge();
        }
        return Charge.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return Charge.GetInstance() as T;
    }
}

export default Charge;