import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import Battlemagic from "../groups-spells/Battlemagic";
import Beguiling from "../groups-spells/Beguiling";
import Combat from "../groups-spells/Combat";
import Detection from "../groups-spells/Detection";
import Enhancement from "@shared/types/ability-types/groups-spells/Enhancement";
import Protective from "../groups-spells/Protective";
import Transportation from "../groups-spells/Transportation";
import Astrology from "@shared/types/ability-types/skills/Astrology";
import ServerCache from "@shared/cache/server-cache";

export class BattlemageDefault implements IAbilityGroup {
  static instance: BattlemageDefault;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];
  public name: string;

  constructor() {
    this.name = this.constructor.name;
    this.abilityGroup = AbilityGroup.BattlemageDefault;
    this.abilityGroupType = AbilityGroupType.Default;
    this.abilities = [
      ...Combat.GetInstance().abilities,
      ...Transportation.GetInstance().abilities,
      ...Protective.GetInstance().abilities,
      ...Enhancement.GetInstance().abilities,
      ...Beguiling.GetInstance().abilities,
      ...Detection.GetInstance().abilities,
      ...Battlemagic.GetInstance().abilities,
      Astrology.GetInstance(),
    ];
  }

  // Method to get the single instance of the class
  public static GetInstance(): BattlemageDefault {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.AbilityGroups[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return BattlemageDefault.GetInstance() as T;
  }
}

export default BattlemageDefault;
