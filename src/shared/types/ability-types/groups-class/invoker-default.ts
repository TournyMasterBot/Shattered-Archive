import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import Astrology from "@shared/types/ability-types/skills/astrology";
import Combat from "../groups-spells/combat";
import Invocation from "../groups-spells/invocation";
import Detection from "../groups-spells/detection";
import Transportation from "../groups-spells/transportation";
import Enhancement from "@shared/types/ability-types/groups-spells/enhancement";
import Illusion from "../groups-spells/illusion";
import Protective from "../groups-spells/protective";

export class InvokerDefault implements IAbilityGroup {
    static instance: InvokerDefault;
    public abilityGroup: AbilityGroup;
    public abilityGroupType: AbilityGroupType;
    public abilities: IAbility[];

    constructor() {
        this.abilityGroup = AbilityGroup.InvokerDefault;
        this.abilityGroupType = AbilityGroupType.Default;
        this.abilities = [
            ...Combat.GetInstance().Get<Combat>().abilities,
            ...Invocation.GetInstance().Get<Invocation>().abilities,
            ...Detection.GetInstance().Get<Detection>().abilities,
            ...Transportation.GetInstance().Get<Transportation>().abilities,
            ...Enhancement.GetInstance().Get<Enhancement>().abilities,
            ...Illusion.GetInstance().Get<Illusion>().abilities,
            ...Protective.GetInstance().Get<Protective>().abilities,
            Astrology.GetInstance().Get(),
        ];
    }

    // Method to get the single instance of the class
    public static GetInstance(): InvokerDefault {
        if (!InvokerDefault.instance) {
            InvokerDefault.instance = new InvokerDefault();
        }
        return InvokerDefault.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return InvokerDefault.GetInstance() as T;
    }
}

export default InvokerDefault;
