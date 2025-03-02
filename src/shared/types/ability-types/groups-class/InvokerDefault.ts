import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import Astrology from "@shared/types/ability-types/skills/Astrology";
import Combat from "../groups-spells/Combat";
import Invocation from "../groups-spells/Invocation";
import Detection from "../groups-spells/Detection";
import Transportation from "../groups-spells/Transportation";
import Enhancement from "@shared/types/ability-types/groups-spells/Enhancement";
import Illusion from "../groups-spells/Illusion";
import Protective from "../groups-spells/Protective";
import ServerCache from "@shared/cache/server-cache";

export class InvokerDefault implements IAbilityGroup {
  static instance: InvokerDefault;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];
  public name: string;

  constructor() {
    this.name = this.constructor.name;
    this.abilityGroup = AbilityGroup.InvokerDefault;
    this.abilityGroupType = AbilityGroupType.Default;
    this.abilities = [
      ...Combat.GetInstance().abilities,
      ...Invocation.GetInstance().abilities,
      ...Detection.GetInstance().abilities,
      ...Transportation.GetInstance().abilities,
      ...Enhancement.GetInstance().abilities,
      ...Illusion.GetInstance().abilities,
      ...Protective.GetInstance().abilities,
      Astrology.GetInstance(),
    ];
  }

  // Method to get the single instance of the class
  public static GetInstance(): InvokerDefault {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.AbilityGroups[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return InvokerDefault.GetInstance() as T;
  }
}

export default InvokerDefault;
