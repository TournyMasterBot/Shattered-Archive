import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import Beguiling from "../groups-spells/Beguiling";
import Combat from "../groups-spells/Combat";
import Detection from "../groups-spells/Detection";
import Enhancement from "@shared/types/ability-types/groups-spells/Enhancement";
import Illusion from "../groups-spells/Illusion";
import Mentalism from "../groups-spells/Mentalism";
import Transportation from "../groups-spells/Transportation";
import Astrology from "@shared/types/ability-types/skills/Astrology";
import ServerCache from "@shared/cache/server-cache";

export class MentalistDefault implements IAbilityGroup {
  static instance: MentalistDefault;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];
  public name: string;

  constructor() {
    this.name = this.constructor.name;
    this.abilityGroup = AbilityGroup.MentalistDefault;
    this.abilityGroupType = AbilityGroupType.Default;
    this.abilities = [
      ...Beguiling.GetInstance().abilities,
      ...Enhancement.GetInstance().abilities,
      ...Transportation.GetInstance().abilities,
      ...Combat.GetInstance().abilities,
      ...Illusion.GetInstance().abilities,
      ...Detection.GetInstance().abilities,
      ...Mentalism.GetInstance().abilities,
      Astrology.GetInstance(),
    ];
  }

  // Method to get the single instance of the class
  public static GetInstance(): MentalistDefault {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.AbilityGroups[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return MentalistDefault.GetInstance() as T;
  }
}

export default MentalistDefault;
