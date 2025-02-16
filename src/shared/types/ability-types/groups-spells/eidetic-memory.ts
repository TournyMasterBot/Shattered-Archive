import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import EideticMemory from "@shared/types/ability-types/skills/eidetic-memory";

export class EideticMemoryGroup implements IAbilityGroup {
    static instance: EideticMemoryGroup;
    public abilityGroup: AbilityGroup;
    public abilityGroupType: AbilityGroupType;
    public abilities: IAbility[];

    constructor() {
        this.abilityGroup = AbilityGroup.EideticMemory;
        this.abilityGroupType = AbilityGroupType.Class;
        this.abilities = [
            EideticMemory.GetInstance().Get(),
        ];
    }

    Get<T>(): T {
        if (!EideticMemoryGroup.instance) {
            EideticMemoryGroup.instance = new EideticMemoryGroup();
        }
        return EideticMemoryGroup.instance as T;
    }
}

export default EideticMemoryGroup;
