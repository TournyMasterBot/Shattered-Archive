import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class PickLock implements IAbility {
    private static instance: PickLock;

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
        this.name = "PickLock";
        this.abilityGroupType = AbilityGroupType.Skills;
        this.abilityUsage = AbilityUsage.Active;
        this.helpFile = `PICK 'PICK LOCK'
Syntax: pick <object>
Syntax: pick <door>
Lock picking is one of the prime skills of thieves, allowing them to gain
access to many secured areas.  Lock picking chances are improved by
intelligence, and hindered by the difficulty of the lock. Other classes may
learn to pick locks, but they will never find it easy.`;

        if (PickLock.instance === undefined) {
            PickLock.instance = this;
        }
    }
    
    // Method to get the single instance of the class
    public static GetInstance(): PickLock {
        if (!PickLock.instance) {
            PickLock.instance = new PickLock();
        }
        return PickLock.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return PickLock.GetInstance() as T;
    }
}

export default PickLock;